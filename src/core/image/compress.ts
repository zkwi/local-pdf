import { hasTransparency, looksPhotographic } from './analyze.ts';
import { canEncode, canvasToBlob, release, UnsupportedEncodingError } from './encode.ts';
import { setJpegDpi } from './jpeg.ts';
import {
  chooseFormat,
  firstFit,
  keepOriginal,
  limitPlan,
  MIME,
  planResize,
  PNG_COLORS,
  QUALITY,
  searchQuality,
  shrinkFactor,
  shrinkPlan,
  TARGET_PNG_COLORS,
} from './plan.ts';
import type { DrawPlan, EncodeFormat, ImageJobOptions } from './plan.ts';
import { encodePng, setPngDpi } from './png.ts';
import { displaySize, sniffImage } from './sniff.ts';
import type { ImageHeader, SourceFormat } from './sniff.ts';

/**
 * 单张图片的处理流水线：读文件头 → 解码（按 EXIF 摆正）→ 等比缩放 / 裁切 → 判断透明
 * → 定输出格式 → 必要时铺底色 → 编码（可按目标大小找画质）→ 不变大保护。
 * 只依赖 createImageBitmap 和 OffscreenCanvas，跑在图片 Worker 里，主线程不卡。
 */

export type ImageErrorCode = 'animated' | 'svg' | 'decode' | 'encode';

export class ImageError extends Error {
  constructor(
    readonly code: ImageErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'ImageError';
  }
}

/** 结果上的提示：界面按 code 找文案，params 插值 */
export interface ImageNote {
  readonly code:
    | 'format-changed'
    | 'alpha-filled'
    | 'limited'
    | 'target-shrunk'
    | 'target-missed'
    | 'dpi-ignored'
    | 'palette'
    /** 原样保留的原因：不用改 / 本来就够小 / 重新压缩不会更小 */
    | 'unchanged'
    | 'within-target'
    | 'not-smaller';
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface ProcessInput {
  readonly file: Blob;
  readonly options: ImageJobOptions;
  /** 单张解码和输出的像素上限（手机更低） */
  readonly maxPixels: number;
  /**
   * 主线程先画成了 PNG 的图：format 是原来的格式（SVG、Safari 里的 HEIC 等），
   * sized 表示已经是最终尺寸（SVG 按目标尺寸栅格化），不用再缩放
   */
  readonly rasterized?: { readonly format: SourceFormat; readonly sized: boolean };
}

export interface ProcessResult {
  readonly blob: Blob;
  readonly format: EncodeFormat;
  readonly width: number;
  readonly height: number;
  readonly sourceFormat: SourceFormat;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** 不变大保护生效，给的是原文件（可能补了 DPI） */
  readonly kept: boolean;
  readonly notes: readonly ImageNote[];
}

interface Encoded {
  readonly blob: Blob;
  readonly size: number;
  /** PNG 减色后的颜色数；没减色为 0 */
  readonly reducedTo: number;
}

export async function processImage(
  input: ProcessInput,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  const { file, options } = input;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = sniffImage(bytes);
  const sourceFormat: SourceFormat = input.rasterized?.format ?? header.format;
  if (header.animated) throw new ImageError('animated');
  if (header.format === 'svg') throw new ImageError('svg');
  signal?.throwIfAborted();

  const notes: ImageNote[] = [];
  const { bitmap, limited } = await decode(file, header, input.maxPixels);
  try {
    signal?.throwIfAborted();
    const source = { width: bitmap.width, height: bitmap.height };
    // 栅格化过的 SVG 已经是最终尺寸
    const planned =
      input.rasterized?.sized === true
        ? planResize(source, { ...options, resize: 'none' })
        : planResize(source, options);
    let plan = limitPlan(planned, input.maxPixels);
    if (limited || plan !== planned) {
      notes.push({ code: 'limited', params: { width: plan.width, height: plan.height } });
    }
    const planChanged = plan.changed || limited;

    let canvas = render(bitmap, plan);
    let ctx = context(canvas);
    const padded = plan.dx > 0 || plan.dy > 0 || plan.dw < plan.width || plan.dh < plan.height;
    let pixels: Uint8ClampedArray | null = null;
    const read = (): Uint8ClampedArray =>
      (pixels ??= ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    const hasAlpha = padded || (header.mayHaveAlpha && hasTransparency(read()));
    const webp = await canEncode('webp');
    // 只有原格式写不出来、要在 PNG 和 JPEG 之间挑时才需要判断像不像照片
    const needPhoto =
      options.output === 'keep'
        ? !(sourceFormat === 'jpeg' || sourceFormat === 'png' || (sourceFormat === 'webp' && webp))
        : options.output === 'webp' && !webp;
    const photographic =
      needPhoto && !hasAlpha ? looksPhotographic(read(), canvas.width, canvas.height) : false;
    const decision = chooseFormat(sourceFormat, options.output, { hasAlpha, photographic, webp });
    const format = decision.format;
    if (decision.changed) notes.push({ code: 'format-changed', params: { format } });

    // JPEG 没有透明；选了「填充」的话所有格式都铺底色
    const fill = hasAlpha && (format === 'jpeg' || options.background === 'fill');
    if (fill) {
      flatten(ctx, canvas, options.color);
      notes.push({ code: 'alpha-filled', params: { color: options.color } });
    }

    // 格式、尺寸、背景都不用改时：本来就够小（按目标大小），或者这个工具不要求重新编码，直接给原图
    const untouched = sourceFormat === format && !planChanged && !fill;
    const reason: ImageNote | null = !untouched
      ? null
      : options.targetBytes > 0
        ? file.size <= options.targetBytes
          ? { code: 'within-target', params: { size: options.targetBytes } }
          : null
        : options.keepUnchanged
          ? { code: 'unchanged' }
          : null;
    if (reason !== null) {
      release(canvas);
      return kept(file, bytes, format, source, sourceFormat, options, [
        reason,
        ...dpiNote(format, options),
      ]);
    }

    const encodeAt = async (
      target: OffscreenCanvas,
      quality: number,
      colors: number,
    ): Promise<Encoded> => {
      signal?.throwIfAborted();
      if (format === 'png') {
        const data = context(target).getImageData(0, 0, target.width, target.height).data;
        const png = encodePng(
          { width: target.width, height: target.height, data },
          { colors, dpi: options.dpi },
        );
        return {
          blob: new Blob([png.bytes as BlobPart], { type: MIME.png }),
          size: png.bytes.length,
          reducedTo: png.lossy ? png.paletteSize : 0,
        };
      }
      let blob = await canvasToBlob(target, format, quality);
      if (format === 'jpeg' && options.dpi > 0) {
        blob = new Blob(
          [setJpegDpi(new Uint8Array(await blob.arrayBuffer()), options.dpi) as BlobPart],
          { type: MIME.jpeg },
        );
      }
      return { blob, size: blob.size, reducedTo: 0 };
    };

    let encoded: Encoded;
    if (options.targetBytes > 0) {
      const target = options.targetBytes;
      let result: { result: Encoded; fits: boolean } | null = null;
      for (let round = 0; round < 6; round++) {
        result =
          format === 'png'
            ? await firstFit(TARGET_PNG_COLORS, (colors) => encodeAt(canvas, 0, colors), target)
            : await searchQuality((quality) => encodeAt(canvas, quality, 0), target);
        if (result.fits || Math.max(plan.width, plan.height) <= 64) break;
        plan = shrinkPlan(plan, shrinkFactor(result.result.size, target));
        release(canvas);
        canvas = render(bitmap, plan);
        ctx = context(canvas);
        if (fill) flatten(ctx, canvas, options.color);
        if (!notes.some((n) => n.code === 'target-shrunk')) notes.push({ code: 'target-shrunk' });
      }
      if (result === null) throw new ImageError('encode');
      encoded = result.result;
      if (!result.fits) notes.push({ code: 'target-missed', params: { size: target } });
    } else {
      encoded = await encodeAt(canvas, QUALITY[options.quality], PNG_COLORS[options.quality]);
    }
    const shrunk = notes.find((n) => n.code === 'target-shrunk');
    if (shrunk !== undefined) {
      notes.splice(notes.indexOf(shrunk), 1, {
        code: 'target-shrunk',
        params: { width: plan.width, height: plan.height },
      });
    }
    if (encoded.reducedTo > 0)
      notes.push({ code: 'palette', params: { colors: encoded.reducedTo } });
    notes.push(...dpiNote(format, options));

    const width = canvas.width;
    const height = canvas.height;
    release(canvas);
    if (
      keepOriginal({
        sourceFormat,
        format,
        planChanged: planChanged || plan.changed,
        backgroundChanged: fill,
        originalSize: file.size,
        outputSize: encoded.size,
      })
    ) {
      return kept(file, bytes, format, source, sourceFormat, options, [
        { code: 'not-smaller' },
        ...dpiNote(format, options),
      ]);
    }
    return {
      blob: encoded.blob,
      format,
      width,
      height,
      sourceFormat,
      sourceWidth: source.width,
      sourceHeight: source.height,
      kept: false,
      notes,
    };
  } catch (error) {
    if (error instanceof UnsupportedEncodingError) throw new ImageError('encode', error.message);
    throw error;
  } finally {
    bitmap.close();
  }
}

/** WebP 写不了 DPI，设了也只能提示一下 */
function dpiNote(format: EncodeFormat, options: ImageJobOptions): ImageNote[] {
  return format === 'webp' && options.dpi > 0 ? [{ code: 'dpi-ignored' }] : [];
}

/** 原文件原样给出；要写 DPI 的 JPEG / PNG 只改头部 */
function kept(
  file: Blob,
  bytes: Uint8Array,
  format: EncodeFormat,
  source: { width: number; height: number },
  sourceFormat: SourceFormat,
  options: ImageJobOptions,
  notes: ImageNote[],
): ProcessResult {
  let blob =
    file.type === MIME[format] ? file : new Blob([bytes as BlobPart], { type: MIME[format] });
  if (options.dpi > 0 && format !== 'webp') {
    const patched =
      format === 'jpeg' ? setJpegDpi(bytes, options.dpi) : setPngDpi(bytes, options.dpi);
    blob = new Blob([patched as BlobPart], { type: MIME[format] });
  }
  return {
    blob,
    format,
    width: source.width,
    height: source.height,
    sourceFormat,
    sourceWidth: source.width,
    sourceHeight: source.height,
    kept: true,
    notes,
  };
}

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new ImageError('encode', 'canvas 2d context unavailable');
  return ctx;
}

/** 在已有内容下面垫一层底色 */
function flatten(
  ctx: OffscreenCanvasRenderingContext2D,
  canvas: OffscreenCanvas,
  color: string,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * 解码并按 EXIF 方向摆正。超过像素上限的图在解码时就缩小：只给 resizeWidth，
 * 不管浏览器先缩放还是先转方向，宽高比都对；按短边算缩放，两种顺序都不会超上限。
 */
async function decode(
  file: Blob,
  header: ImageHeader,
  maxPixels: number,
): Promise<{ bitmap: ImageBitmap; limited: boolean }> {
  const shown = displaySize(header);
  try {
    if (shown !== null && shown.width * shown.height > maxPixels) {
      const scale = Math.sqrt(maxPixels / (shown.width * shown.height));
      const basis = header.orientation >= 5 ? Math.min(shown.width, shown.height) : shown.width;
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        resizeWidth: Math.max(1, Math.floor(basis * scale)),
        resizeQuality: 'high',
      });
      return { bitmap, limited: true };
    }
    return {
      bitmap: await createImageBitmap(file, { imageOrientation: 'from-image' }),
      limited: false,
    };
  } catch (error) {
    throw new ImageError('decode', error instanceof Error ? error.message : String(error));
  }
}

/**
 * 按计划画到新画布上。缩小超过一半时先对半缩几次：一步缩太多，浏览器的插值会出锯齿和摩尔纹。
 */
function render(bitmap: ImageBitmap, plan: DrawPlan): OffscreenCanvas {
  let source: ImageBitmap | OffscreenCanvas = bitmap;
  let { sx, sy, sw, sh } = plan;
  while (sw / plan.dw > 2 && sh / plan.dh > 2) {
    const w = Math.max(plan.dw, Math.round(sw / 2));
    const h = Math.max(plan.dh, Math.round(sh / 2));
    const step = new OffscreenCanvas(w, h);
    const ctx = step.getContext('2d');
    if (ctx === null) break;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
    if (source instanceof OffscreenCanvas) release(source);
    source = step;
    sx = 0;
    sy = 0;
    sw = w;
    sh = h;
  }
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const ctx = context(canvas);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, plan.dx, plan.dy, plan.dw, plan.dh);
  if (source instanceof OffscreenCanvas) release(source);
  return canvas;
}
