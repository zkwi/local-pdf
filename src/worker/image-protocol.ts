import type { ImageErrorCode, ProcessInput, ProcessResult } from '../core/image/compress.ts';
import type { ImageJobOptions } from '../core/image/plan.ts';

/** 图片 Worker 的消息：一次只处理一张，主线程按顺序送 */

/** memory：分配内存失败；crashed：Worker 整个退出了（多半也是内存） */
export type ImageFailure = ImageErrorCode | 'memory' | 'crashed' | 'unknown';

export interface ImageWorkerRequest {
  readonly type: 'process';
  readonly id: number;
  readonly file: Blob;
  readonly options: ImageJobOptions;
  readonly maxPixels: number;
  readonly rasterized?: ProcessInput['rasterized'];
}

export type ImageWorkerResponse =
  | { readonly type: 'done'; readonly id: number; readonly result: ProcessResult }
  | {
      readonly type: 'failed';
      readonly id: number;
      readonly code: ImageFailure;
      readonly detail: string;
    };
