/// <reference lib="webworker" />
import { ImageError, processImage } from '../core/image/compress.ts';
import type { ImageFailure, ImageWorkerRequest, ImageWorkerResponse } from './image-protocol.ts';

/**
 * 图片压缩、转换、缩放的 Worker：解码、缩放、减色、编码都在这里，主线程只管界面。
 * 取消由主线程直接 terminate 这个 Worker，正在编码的图也能立刻停下。
 */

const post = (message: ImageWorkerResponse): void => {
  self.postMessage(message);
};

function classify(error: unknown): ImageFailure {
  if (error instanceof ImageError) return error.code;
  if (error instanceof RangeError || /allocation|out of memory/i.test(String(error))) {
    return 'memory';
  }
  return 'unknown';
}

self.onmessage = async (event: MessageEvent<ImageWorkerRequest>): Promise<void> => {
  const request = event.data;
  if (request.type !== 'process') return;
  try {
    const result = await processImage({
      file: request.file,
      options: request.options,
      maxPixels: request.maxPixels,
      rasterized: request.rasterized,
    });
    post({ type: 'done', id: request.id, result });
  } catch (error) {
    post({
      type: 'failed',
      id: request.id,
      code: classify(error),
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};
