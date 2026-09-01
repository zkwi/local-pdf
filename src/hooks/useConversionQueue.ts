import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConvertOptions } from '../core/contracts/options.ts';
import type { ConversionProgress, ConversionReport } from '../core/contracts/report.ts';
import type { WorkerErrorCode, WorkerRequest, WorkerResponse } from '../worker/protocol.ts';

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface JobResult {
  readonly url: string;
  readonly fileName: string;
  readonly size: number;
  readonly report: ConversionReport;
}

export interface Job {
  readonly id: string;
  readonly file: File;
  readonly status: JobStatus;
  readonly progress: ConversionProgress;
  readonly result?: JobResult;
  readonly error?: { code: WorkerErrorCode; message: string };
}

const INITIAL_PROGRESS: ConversionProgress = {
  stage: 'queued',
  fraction: 0,
  message: '排队中',
};

function assetBase(): string {
  const base = new URL(import.meta.env.BASE_URL, location.href).href;
  return base.endsWith('/') ? base : `${base}/`;
}

let seq = 0;
const nextId = (): string => `job-${Date.now().toString(36)}-${seq++}`;

export function useConversionQueue() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const filesRef = useRef(new Map<string, File>());

  const patch = useCallback((id: string, updater: (job: Job) => Job): void => {
    setJobs((prev) => prev.map((job) => (job.id === id ? updater(job) : job)));
  }, []);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current !== null) return workerRef.current;
    const worker = new Worker(new URL('../worker/conversion.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pdf2word-conversion',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        patch(message.jobId, (job) => ({ ...job, status: 'running', progress: message.progress }));
        return;
      }
      if (message.type === 'done') {
        const url = URL.createObjectURL(message.blob);
        patch(message.jobId, (job) => ({
          ...job,
          status: 'done',
          progress: { stage: 'completed', fraction: 1, message: '转换完成' },
          result: {
            url,
            fileName: message.fileName,
            size: message.blob.size,
            report: message.report,
          },
        }));
        filesRef.current.delete(message.jobId);
        return;
      }
      patch(message.jobId, (job) => ({
        ...job,
        status: message.code === 'cancelled' ? 'cancelled' : 'error',
        progress: {
          stage: message.code === 'cancelled' ? 'cancelled' : 'failed',
          fraction: 0,
          message: message.message,
        },
        error: { code: message.code, message: message.message },
      }));
    };
    workerRef.current = worker;
    return worker;
  }, [patch]);

  const submit = useCallback(
    async (id: string, file: File, options: ConvertOptions): Promise<void> => {
      const worker = ensureWorker();
      const buffer = await file.arrayBuffer();
      const request: WorkerRequest = {
        type: 'convert',
        jobId: id,
        buffer,
        fileName: file.name,
        options,
        assetBase: assetBase(),
      };
      worker.postMessage(request, [buffer]);
    },
    [ensureWorker],
  );

  const enqueue = useCallback(
    (files: readonly File[], options: ConvertOptions): void => {
      const created: Job[] = files.map((file) => {
        const id = nextId();
        filesRef.current.set(id, file);
        return { id, file, status: 'queued', progress: INITIAL_PROGRESS };
      });
      setJobs((prev) => [...created, ...prev]);
      for (const job of created) {
        void submit(job.id, job.file, options).catch((error: unknown) => {
          patch(job.id, (j) => ({
            ...j,
            status: 'error',
            error: { code: 'unknown', message: error instanceof Error ? error.message : '读取文件失败' },
            progress: { stage: 'failed', fraction: 0, message: '读取文件失败' },
          }));
        });
      }
    },
    [patch, submit],
  );

  const cancel = useCallback((id: string): void => {
    workerRef.current?.postMessage({ type: 'cancel', jobId: id } satisfies WorkerRequest);
  }, []);

  const retry = useCallback(
    (id: string, options: ConvertOptions): void => {
      const job = jobs.find((j) => j.id === id);
      if (job === undefined) return;
      patch(id, (j) => ({ ...j, status: 'queued', progress: INITIAL_PROGRESS, error: undefined }));
      void submit(id, job.file, options).catch(() => {
        patch(id, (j) => ({
          ...j,
          status: 'error',
          error: { code: 'unknown', message: '读取文件失败' },
          progress: { stage: 'failed', fraction: 0, message: '读取文件失败' },
        }));
      });
    },
    [jobs, patch, submit],
  );

  const remove = useCallback((id: string): void => {
    setJobs((prev) => {
      const target = prev.find((job) => job.id === id);
      if (target?.result) URL.revokeObjectURL(target.result.url);
      return prev.filter((job) => job.id !== id);
    });
    filesRef.current.delete(id);
  }, []);

  const clearFinished = useCallback((): void => {
    setJobs((prev) => {
      for (const job of prev) {
        if (job.status !== 'running' && job.status !== 'queued' && job.result) {
          URL.revokeObjectURL(job.result.url);
        }
      }
      return prev.filter((job) => job.status === 'running' || job.status === 'queued');
    });
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const urls = jobs.map((job) => job.result?.url).filter((u): u is string => u !== undefined);
    return () => {
      // 组件卸载时统一回收，避免 Blob 一直挂在内存里
      if (workerRef.current === null) for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [jobs]);

  return { jobs, enqueue, cancel, retry, remove, clearFinished };
}
