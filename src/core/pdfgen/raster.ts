import type { PdfImageSource } from './document.ts';
import { isJpeg, parseJpeg } from './jpeg.ts';

/** auto：照片走 JPEG、图表截图走无损；lossless：全部无损；compact：全部 JPEG 并缩到 2000 px 以内 */
export type ImageQuality = 'auto' | 'lossless' | 'compact';

/** 无损像素超过这个数就太大了（一张 4K 截图约 8 MP → 25 MB 原始像素） */
const MAX_LOSSLESS_PIXELS = 12_000_000;
/** 任何图都不会按超过这个像素数解码 */
const MAX_DECODE_PIXELS = 30_000_000;
const COMPACT_MAX_SIDE = 2000;
const JPEG_QUALITY_AUTO = 0.9;
const JPEG_QUALITY_COMPACT = 0.8;

type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function toJpeg(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number,
): Promise<Uint8Array> {
  const blob =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
      : await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
            'image/jpeg',
            quality,
          );
        });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * 抽样判断是不是照片：颜色种类多的是照片，JPEG 划算；截图、图表颜色少，无损 Flate 反而更小也更清楚。
 */
function looksPhotographic(pixels: Uint8ClampedArray, width: number, height: number): boolean {
  const total = width * height;
  const samples = Math.min(4096, total);
  const step = Math.max(1, Math.floor(total / samples));
  const colors = new Set<number>();
  let count = 0;
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    // 低两位抹掉，抗噪
    colors.add(((pixels[i] >> 2) << 12) | ((pixels[i + 1] >> 2) << 6) | (pixels[i + 2] >> 2));
    count++;
  }
  return colors.size > count * 0.35;
}

/**
 * 把可绘制对象编码成 PDF 图像。透明部分铺白，PDF 里不带蒙版。
 */
export async function encodeDrawable(
  source: Drawable,
  sourceWidth: number,
  sourceHeight: number,
  quality: ImageQuality,
): Promise<PdfImageSource> {
  let maxPixels = MAX_DECODE_PIXELS;
  if (quality === 'compact') maxPixels = COMPACT_MAX_SIDE * COMPACT_MAX_SIDE;
  const shrink = Math.min(1, Math.sqrt(maxPixels / Math.max(1, sourceWidth * sourceHeight)));
  const width = Math.max(1, Math.round(sourceWidth * shrink));
  const height = Math.max(1, Math.round(sourceHeight * shrink));

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (ctx === null) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  const pixels = width * height;
  let useJpeg = quality === 'compact';
  if (quality === 'auto') {
    if (pixels > MAX_LOSSLESS_PIXELS) useJpeg = true;
    else if (pixels > 60_000) {
      const data = ctx.getImageData(0, 0, width, height).data;
      useJpeg = looksPhotographic(data, width, height);
    }
  }

  let result: PdfImageSource;
  if (useJpeg) {
    const data = await toJpeg(
      canvas,
      quality === 'compact' ? JPEG_QUALITY_COMPACT : JPEG_QUALITY_AUTO,
    );
    result = { filter: 'dct', colorSpace: 'rgb', data, width, height };
  } else {
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const rgb = new Uint8Array(pixels * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    result = { filter: 'flate', colorSpace: 'rgb', data: rgb, width, height };
  }
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

export interface DecodedImage {
  readonly source: PdfImageSource;
  /** 显示时还要顺时针转多少度（原样嵌入的 JPEG 把 EXIF 方向留给绘制阶段处理） */
  readonly rotation: 0 | 90 | 180 | 270;
}

const EXIF_ROTATION: Record<number, 0 | 90 | 180 | 270> = { 1: 0, 3: 180, 6: 90, 8: 270 };

/**
 * 文件 → PDF 图像。JPEG 在不需要压缩时原样嵌入（不重新编码、不掉画质），
 * 其他格式和带镜像 EXIF 方向的 JPEG 解码后重新编码。
 */
export async function encodeImageFile(
  file: Blob,
  quality: ImageQuality,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  if (quality !== 'compact' && isJpeg(bytes)) {
    const info = parseJpeg(bytes);
    const rotation = info === null ? undefined : EXIF_ROTATION[info.orientation];
    if (
      info !== null &&
      rotation !== undefined &&
      (info.components === 3 || info.components === 1)
    ) {
      return {
        source: {
          filter: 'dct',
          colorSpace: info.components === 1 ? 'gray' : 'rgb',
          data: bytes,
          width: info.width,
          height: info.height,
        },
        rotation,
      };
    }
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    signal?.throwIfAborted();
    const source = await encodeDrawable(bitmap, bitmap.width, bitmap.height, quality);
    return { source, rotation: 0 };
  } finally {
    bitmap.close();
  }
}
