import type { ProcessInput, ProcessResult } from '../core/image/compress.ts';
import type { ImageJobOptions } from '../core/image/plan.ts';
import type {
  ImageFailure,
  ImageWorkerRequest,
  ImageWorkerResponse,
} from '../worker/image-protocol.ts';

/**
 * 三个图片工具共用的图片 Worker 池：同时提交几张就用几个 Worker（最多 MAX_WORKERS 个），按先来后到开始。
 * 内存按像素记账：正在处理的图加起来不超过单张的像素上限，所以同时处理几张也不会比单张最大的那种情况更占内存；
 * 一张就超预算的大图等前面的做完再单独做。
 * 取消正在处理的那张时直接 terminate 它所在的 Worker，下一张需要时再起一个新的。
 */

/** 并行几张由调用方按设备决定（手机一张一张来），这里只兜一个总数 */
const MAX_WORKERS = 3;

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
  /** 这张大概要处理多少像素，用来控制同时处理的总量；不知道就按单张上限算 */
  readonly pixels?: number;
}

interface Pending {
  readonly request: ImageWorkerRequest;
  readonly pixels: number;
  readonly resolve: (result: ProcessResult) => void;
  readonly reject: (error: Error) => void;
  readonly detach: () => void;
}

interface Slot {
  worker: Worker | null;
  active: Pending | null;
}

const slots: Slot[] = [];
const waiting: Pending[] = [];
let seq = 0;

const abortError = (): Error => new DOMException('cancelled', 'AbortError');

function stop(slot: Slot): void {
  slot.worker?.terminate();
  slot.worker = null;
}

function settle(job: Pending, outcome: { result: ProcessResult } | { error: Error }): void {
  job.detach();
  if ('result' in outcome) job.resolve(outcome.result);
  else job.reject(outcome.error);
}

function spawn(slot: Slot): Worker {
  const w = new Worker(new URL('../worker/image.worker.ts', import.meta.url), {
    type: 'module',
    name: 'local-pdf-images',
  });
  w.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
    const message = event.data;
    const job = slot.active;
    if (job === null || message.id !== job.request.id) return;
    slot.active = null;
    if (message.type === 'done') settle(job, { result: message.result });
    else settle(job, { error: new ImageJobError(message.code, message.detail) });
    pump();
  };
  w.onerror = (event) => {
    // Worker 整个崩了（多半是内存耗尽）：它手上这张算失败，后面的换个新 Worker 接着处理
    event.preventDefault();
    if (slot.worker === w) stop(slot);
    const job = slot.active;
    slot.active = null;
    if (job !== null) {
      settle(job, { error: new ImageJobError('crashed', event.message || 'worker crashed') });
    }
    pump();
  };
  return w;
}

function pump(): void {
  for (;;) {
    const next = waiting[0];
    if (next === undefined) return;
    const busy = slots.filter((slot) => slot.active !== null);
    const inflight = busy.reduce((sum, slot) => sum + (slot.active?.pixels ?? 0), 0);
    // 严格按先来后到：排头这张放不下就等，不让后面的小图插队，免得大图一直轮不到
    if (busy.length > 0 && inflight + next.pixels > next.request.maxPixels) return;
    let slot = slots.find((each) => each.active === null);
    if (slot === undefined) {
      if (slots.length >= MAX_WORKERS) return;
      slot = { worker: null, active: null };
      slots.push(slot);
    }
    waiting.shift();
    slot.active = next;
    slot.worker ??= spawn(slot);
    slot.worker.postMessage(next.request);
  }
}

export function processInWorker(
  { pixels, ...input }: ImageJobInput,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<ProcessResult>((resolve, reject) => {
    const onAbort = (): void => {
      const index = waiting.indexOf(job);
      if (index >= 0) {
        waiting.splice(index, 1);
        settle(job, { error: abortError() });
        pump();
        return;
      }
      const slot = slots.find((each) => each.active === job);
      if (slot !== undefined) {
        slot.active = null;
        stop(slot);
        settle(job, { error: abortError() });
        pump();
      }
    };
    const job: Pending = {
      request: { type: 'process', id: ++seq, ...input },
      pixels: Math.min(input.maxPixels, pixels ?? input.maxPixels),
      resolve,
      reject,
      detach: () => signal?.removeEventListener('abort', onAbort),
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    waiting.push(job);
    pump();
  });
}
