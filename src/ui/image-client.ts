import type { ProcessInput, ProcessResult } from '../core/image/compress.ts';
import type { ImageJobOptions } from '../core/image/plan.ts';
import type {
  ImageFailure,
  ImageWorkerRequest,
  ImageWorkerResponse,
} from '../worker/image-protocol.ts';

/**
 * 三个图片工具共用一个 Worker，按先来后到一张一张处理，内存里同时只有一张大图。
 * 取消正在处理的那张时直接 terminate，下一张需要时再起一个新的 Worker。
 */

export class ImageJobError extends Error {
  constructor(
    readonly code: ImageFailure,
    detail: string,
  ) {
    super(detail);
    this.name = 'ImageJobError';
  }
}

export interface ImageJobInput {
  readonly file: Blob;
  readonly options: ImageJobOptions;
  readonly maxPixels: number;
  readonly rasterized?: ProcessInput['rasterized'];
}

interface Pending {
  readonly request: ImageWorkerRequest;
  readonly resolve: (result: ProcessResult) => void;
  readonly reject: (error: Error) => void;
  readonly detach: () => void;
}

let worker: Worker | null = null;
let active: Pending | null = null;
const waiting: Pending[] = [];
let seq = 0;

const abortError = (): Error => new DOMException('cancelled', 'AbortError');

function stop(): void {
  worker?.terminate();
  worker = null;
}

function settle(job: Pending, outcome: { result: ProcessResult } | { error: Error }): void {
  job.detach();
  if ('result' in outcome) job.resolve(outcome.result);
  else job.reject(outcome.error);
}

function spawn(): Worker {
  const w = new Worker(new URL('../worker/image.worker.ts', import.meta.url), {
    type: 'module',
    name: 'local-pdf-images',
  });
  w.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
    const message = event.data;
    const job = active;
    if (job === null || message.id !== job.request.id) return;
    active = null;
    if (message.type === 'done') settle(job, { result: message.result });
    else settle(job, { error: new ImageJobError(message.code, message.detail) });
    pump();
  };
  w.onerror = (event) => {
    // Worker 整个崩了（多半是内存耗尽）：当前这张算失败，后面的换个新 Worker 接着处理
    event.preventDefault();
    if (worker === w) stop();
    const job = active;
    active = null;
    if (job !== null) {
      settle(job, { error: new ImageJobError('crashed', event.message || 'worker crashed') });
    }
    pump();
  };
  return w;
}

function pump(): void {
  if (active !== null) return;
  const next = waiting.shift();
  if (next === undefined) return;
  active = next;
  worker ??= spawn();
  worker.postMessage(next.request);
}

export function processInWorker(
  input: ImageJobInput,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<ProcessResult>((resolve, reject) => {
    const onAbort = (): void => {
      const index = waiting.indexOf(job);
      if (index >= 0) {
        waiting.splice(index, 1);
        settle(job, { error: abortError() });
        return;
      }
      if (active === job) {
        active = null;
        stop();
        settle(job, { error: abortError() });
        pump();
      }
    };
    const job: Pending = {
      request: { type: 'process', id: ++seq, ...input },
      resolve,
      reject,
      detach: () => signal?.removeEventListener('abort', onAbort),
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    waiting.push(job);
    pump();
  });
}
