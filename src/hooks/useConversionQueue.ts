import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConvertOptions } from '../core/contracts/options.ts';
import type { ConversionProgress, ConversionReport, OutputKind } from '../core/contracts/report.ts';
import { pushSample } from '../ui/eta.ts';
import type { PageSample } from '../ui/eta.ts';
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
  /** 提交时用的设置；界面据此决定要不要提供"只要文字"重试 */
  readonly options: ConvertOptions;
  readonly status: JobStatus;
  readonly progress: ConversionProgress;
  /** 第一条进度到达的时间；排队中的任务还没有 */
  readonly startedAt?: number;
  readonly finishedAt?: number;
  /** 逐页阶段的采样点，估算剩余时间用 */
  readonly samples: readonly PageSample[];
  /** 已经 OCR 过的页数：扫描页占大头时提示里要解释为什么慢 */
  readonly ocrPages: number;
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

function applyProgress(job: Job, progress: ConversionProgress, at: number): Job {
  return {
    ...job,
    status: 'running',
    progress,
    startedAt: job.startedAt ?? at,
    samples:
      (progress.stage === 'extracting' || progress.stage === 'rendering') &&
      progress.pageIndex !== undefined
        ? pushSample(job.samples, progress.pageIndex, at)
        : job.samples,
    // 每个需要识别的页面进入 ocr 阶段时恰好发一条进度
    ocrPages: job.ocrPages + (progress.stage === 'ocr' ? 1 : 0),
  };
}

/** 新建或重试时的初始状态 */
function fresh(job: Job, options: ConvertOptions): Job {
  return {
    ...job,
    options,
    status: 'queued',
    progress: INITIAL_PROGRESS,
    startedAt: undefined,
    finishedAt: undefined,
    samples: [],
    ocrPages: 0,
    result: undefined,
    error: undefined,
  };
}

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
        finishedAt: Date.now(),
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
        const at = Date.now();
        patch(message.jobId, (job) => applyProgress(job, message.progress, at));
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
          finishedAt: Date.now(),
          result: { outputs, report: message.report },
        }));
        filesRef.current.delete(message.jobId);
        return;
      }
      fail(message.jobId, message.error);
    };
    worker.onerror = (event) => {
      // Worker 整个崩了（多半是内存耗尽）：没结束的任务一起标失败，下次再起一个新的
      event.preventDefault();
      const detail = event.message || 'worker crashed';
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setJobs((prev) =>
        prev.map((job) =>
          job.status === 'running' || job.status === 'queued'
            ? {
                ...job,
                status: 'error',
                progress: FAILED_PROGRESS,
                finishedAt: Date.now(),
                error: { code: 'worker-crashed', detail },
              }
            : job,
        ),
      );
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
        return fresh(
          {
            id,
            file,
            options,
            status: 'queued',
            progress: INITIAL_PROGRESS,
            samples: [],
            ocrPages: 0,
          },
          options,
        );
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
      patch(id, (j) => fresh(j, options));
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
