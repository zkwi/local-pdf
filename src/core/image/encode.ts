import { MIME } from './plan.ts';
import type { EncodeFormat } from './plan.ts';

/** 画布编码。主线程和 Worker 都能用（只依赖 OffscreenCanvas）。 */

export class UnsupportedEncodingError extends Error {
  constructor(readonly format: EncodeFormat) {
    super(`this browser cannot encode ${format}`);
    this.name = 'UnsupportedEncodingError';
  }
}

/** 浏览器不支持某种编码时不会报错，而是悄悄给 PNG，所以要核对返回的类型 */
export async function canvasToBlob(
  canvas: OffscreenCanvas,
  format: EncodeFormat,
  quality?: number,
): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type: MIME[format], quality });
  if (blob.type !== MIME[format]) throw new UnsupportedEncodingError(format);
  return blob;
}

const support = new Map<EncodeFormat, Promise<boolean>>();

export function canEncode(format: EncodeFormat): Promise<boolean> {
  let pending = support.get(format);
  if (pending === undefined) {
    pending = (async () => {
      try {
        const canvas = new OffscreenCanvas(2, 2);
        canvas.getContext('2d')?.fillRect(0, 0, 1, 1);
        const blob = await canvas.convertToBlob({ type: MIME[format], quality: 0.8 });
        return blob.type === MIME[format];
      } catch {
        return false;
      }
    })();
    support.set(format, pending);
  }
  return pending;
}

/** 用完的画布把尺寸清零，浏览器能立刻回收像素内存 */
export function release(canvas: OffscreenCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}
