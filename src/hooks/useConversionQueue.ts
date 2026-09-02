import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConvertOptions } from '../core/contracts/options.ts';
import type { ConversionProgress, ConversionReport, OutputKind } from '../core/contracts/report.ts';
import type { WorkerError, WorkerRequest, WorkerResponse } from '../worker/protocol.ts';

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface JobOutput {
  readonly kind: OutputKind;
  readonly url: string;
  readonly fileName: string;
  readonly size: number;
}

export interface JobResult {
  readonly outputs: readonly JobOutput[];
  readonly report: ConversionReport;
}

export interface Job {
  readonly id: string;
  readonly file: File;
  readonly status: JobStatus;
  readonly progress: ConversionProgress;
  readonly result?: JobResult;
  readonly error?: WorkerError;
}

const INITIAL_PROGRESS: ConversionProgress = { stage: 'queued', fraction: 0, key: 'queued' };
const FAILED_PROGRESS: ConversionProgress = { stage: 'failed', fraction: 0, key: 'failed' };

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

  const fail = useCallback(
    (id: string, error: WorkerError): void => {
      patch(id, (job) => ({
        ...job,
        status: error.code === 'cancelled' ? 'cancelled' : 'error',
        progress:
          error.code === 'cancelled'
            ? { stage: 'cancelled', fraction: 0, key: 'cancelled' }
            : FAILED_PROGRESS,
        error,
      }));
    },
    [patch],
  );

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current !== null) return workerRef.current;
    const worker = new Worker(new URL('../worker/conversion.worker.ts', import.meta.url), {
      type: 'module',
      name: 'local-pdf-conversion',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      // pdf.js 的 worker 模块在 Worker 上下文里会自己往主线程发一条 ready 握手，跳过
      if (message.type !== 'progress' && message.type !== 'done' && message.type !== 'error')
        return;
      if (message.type === 'progress') {
        patch(message.jobId, (job) => ({ ...job, status: 'running', progress: message.progress }));
        return;
      }
      if (message.type === 'done') {
        const outputs: JobOutput[] = message.outputs.map((o) => ({
          kind: o.kind,
          url: URL.createObjectURL(o.blob),
          fileName: o.fileName,
          size: o.blob.size,
        }));
        patch(message.jobId, (job) => ({
          ...job,
          status: 'done',
          progress: { stage: 'completed', fraction: 1, key: 'completed' },
          result: { outputs, report: message.report },
        }));
        filesRef.current.delete(message.jobId);
        return;
      }
      fail(message.jobId, message.error);
    };
    workerRef.current = worker;
    return worker;
  }, [fail, patch]);

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
          fail(job.id, {
            code: 'unknown',
            detail: error instanceof Error ? error.message : 'read-file',
          });
        });
      }
    },
    [fail, submit],
  );

  const cancel = useCallback((id: string): void => {
    workerRef.current?.postMessage({ type: 'cancel', jobId: id } satisfies WorkerRequest);
  }, []);

  const retry = useCallback(
    (id: string, options: ConvertOptions): void => {
      const job = jobs.find((j) => j.id === id);
      if (job === undefined) return;
      patch(id, (j) => ({ ...j, status: 'queued', progress: INITIAL_PROGRESS, error: undefined }));
      void submit(id, job.file, options).catch((error: unknown) => {
        fail(id, { code: 'unknown', detail: error instanceof Error ? error.message : 'read-file' });
      });
    },
    [fail, jobs, patch, submit],
  );

  const remove = useCallback((id: string): void => {
    setJobs((prev) => {
      const target = prev.find((job) => job.id === id);
      for (const o of target?.result?.outputs ?? []) URL.revokeObjectURL(o.url);
      return prev.filter((job) => job.id !== id);
    });
    filesRef.current.delete(id);
  }, []);

  const clearFinished = useCallback((): void => {
    setJobs((prev) => {
      for (const job of prev) {
        if (job.status !== 'running' && job.status !== 'queued' && job.result) {
          for (const o of job.result.outputs) URL.revokeObjectURL(o.url);
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
    const urls = jobs.flatMap((job) => job.result?.outputs.map((o) => o.url) ?? []);
    return () => {
      // 组件卸载时统一回收，避免 Blob 一直挂在内存里
      if (workerRef.current === null) for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [jobs]);

  return { jobs, enqueue, cancel, retry, remove, clearFinished, warmUp: ensureWorker };
}
