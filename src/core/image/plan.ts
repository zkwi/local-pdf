import { clampInt } from '../util/number.ts';
import type { SourceFormat } from './sniff.ts';

/**
 * 图片工具的纯规则：目标尺寸怎么算、输出什么格式、文件叫什么、画质档位对应什么参数。
 * 不碰画布和解码，单测直接喂数字。
 */

/** 浏览器画布能写出的格式；AVIF 编码浏览器不支持（请求了会悄悄退回 PNG） */
export type EncodeFormat = 'jpeg' | 'png' | 'webp';
/** keep：尽量保持原格式 */
export type OutputChoice = 'keep' | EncodeFormat;
export type QualityPreset = 'high' | 'standard' | 'small';
export type ResizeMode = 'none' | 'long' | 'width' | 'height' | 'percent' | 'exact';
/** cover：等比放大到盖满后居中裁切；contain：等比缩放到完整放进去，四周留边 */
export type ExactFit = 'cover' | 'contain';
export type BackgroundMode = 'keep' | 'fill';

export interface ImageJobOptions {
  readonly output: OutputChoice;
  readonly quality: QualityPreset;
  /** 单张大小上限（字节），0 表示不限 */
  readonly targetBytes: number;
  readonly resize: ResizeMode;
  /** long / width / height 模式的像素值 */
  readonly size: number;
  readonly percent: number;
  readonly exactWidth: number;
  readonly exactHeight: number;
  readonly fit: ExactFit;
  readonly background: BackgroundMode;
  /** #rrggbb；JPEG 的透明部分、填充模式、contain 留边都用它 */
  readonly color: string;
  /** 写进文件的 DPI 标记，0 表示不写 */
  readonly dpi: number;
  /**
   * 格式、尺寸、背景都不用改的图原样保留、不重新编码（转换和改尺寸用：已经是 JPG、已经够小的图不该掉画质）。
   * 压缩时为 false：照样重新编码，只在结果不更小时才保留原图。
   */
  readonly keepUnchanged: boolean;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** 从源图取哪一块、画到画布的哪一块 */
export interface DrawPlan extends Size {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
  /** 输出尺寸或取景和原图不同 */
  readonly changed: boolean;
}

/** 画布边长的保守上限：各浏览器都能分配 */
export const MAX_SIDE = 16384;

function whole(src: Size, width: number, height: number): DrawPlan {
  return {
    width,
    height,
    sx: 0,
    sy: 0,
    sw: src.width,
    sh: src.height,
    dx: 0,
    dy: 0,
    dw: width,
    dh: height,
    changed: width !== src.width || height !== src.height,
  };
}

/** 按比例缩放整张图；位图只缩小不放大，矢量图（SVG）可以放大 */
function scaled(src: Size, scale: number, upscale: boolean): DrawPlan {
  if (!(scale < 1) && !(upscale && scale > 1)) return whole(src, src.width, src.height);
  return whole(
    src,
    Math.max(1, Math.round(src.width * scale)),
    Math.max(1, Math.round(src.height * scale)),
  );
}

/**
 * 目标尺寸。除了「精确尺寸」，所有模式都等比、只缩小不放大：比目标还小的图保持原样。
 * 宽高指摆正（EXIF 方向）之后看到的样子。upscale 只给矢量图用：放大不会糊。
 */
export function planResize(src: Size, o: ImageJobOptions, upscale = false): DrawPlan {
  const size = clampInt(o.size, 1, MAX_SIDE);
  switch (o.resize) {
    case 'long':
      return scaled(src, size / Math.max(src.width, src.height), upscale);
    case 'width':
      return scaled(src, size / src.width, upscale);
    case 'height':
      return scaled(src, size / src.height, upscale);
    case 'percent':
      return scaled(src, clampInt(o.percent, 1, 100) / 100, false);
    case 'exact':
      return planExact(
        src,
        clampInt(o.exactWidth, 1, MAX_SIDE),
        clampInt(o.exactHeight, 1, MAX_SIDE),
        o.fit,
      );
    case 'none':
      return whole(src, src.width, src.height);
  }
}

function planExact(src: Size, width: number, height: number, fit: ExactFit): DrawPlan {
  if (width === src.width && height === src.height) return whole(src, width, height);
  if (fit === 'cover') {
    const scale = Math.max(width / src.width, height / src.height);
    const sw = Math.min(src.width, width / scale);
    const sh = Math.min(src.height, height / scale);
    return {
      width,
      height,
      sx: (src.width - sw) / 2,
      sy: (src.height - sh) / 2,
      sw,
      sh,
      dx: 0,
      dy: 0,
      dw: width,
      dh: height,
      changed: true,
    };
  }
  const scale = Math.min(width / src.width, height / src.height);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  return {
    width,
    height,
    sx: 0,
    sy: 0,
    sw: src.width,
    sh: src.height,
    dx: Math.floor((width - dw) / 2),
    dy: Math.floor((height - dh) / 2),
    dw,
    dh,
    changed: true,
  };
}

/** 计划好的画布超过像素上限时整体等比缩小（取景不变） */
export function limitPlan(plan: DrawPlan, maxPixels: number): DrawPlan {
  const pixels = plan.width * plan.height;
  const sideScale = MAX_SIDE / Math.max(plan.width, plan.height);
  const scale = Math.min(1, Math.sqrt(maxPixels / pixels), sideScale);
  if (scale >= 1) return plan;
  // 向下取整，保证不超上限
  const k = (v: number): number => Math.max(1, Math.floor(v * scale));
  return {
    ...plan,
    width: k(plan.width),
    height: k(plan.height),
    dx: Math.floor(plan.dx * scale),
    dy: Math.floor(plan.dy * scale),
    dw: k(plan.dw),
    dh: k(plan.dh),
    changed: true,
  };
}

/** 再缩一档（按目标大小压不下去时用），保持取景 */
export function shrinkPlan(plan: DrawPlan, factor: number): DrawPlan {
  const k = (v: number): number => Math.max(1, Math.round(v * factor));
  return {
    ...plan,
    width: k(plan.width),
    height: k(plan.height),
    dx: Math.floor(plan.dx * factor),
    dy: Math.floor(plan.dy * factor),
    dw: k(plan.dw),
    dh: k(plan.dh),
    changed: true,
  };
}

export interface FormatFacts {
  /** 解码后确实有不透明度不足 255 的像素（含 contain 留下的透明边） */
  readonly hasAlpha: boolean;
  /** 颜色多、像照片 */
  readonly photographic: boolean;
  /** 当前浏览器能编码 WebP */
  readonly webp: boolean;
}

export interface FormatDecision {
  readonly format: EncodeFormat;
  /** 「保持原格式」没能保持（原格式写不出来） */
  readonly changed: boolean;
}

/** 写不出原格式时的退路：有透明或像截图就 PNG，像照片就 JPEG */
function fallback(facts: FormatFacts): EncodeFormat {
  return facts.hasAlpha || !facts.photographic ? 'png' : 'jpeg';
}

export function chooseFormat(
  source: SourceFormat,
  choice: OutputChoice,
  facts: FormatFacts,
): FormatDecision {
  if (choice === 'webp') {
    return facts.webp
      ? { format: 'webp', changed: false }
      : { format: fallback(facts), changed: true };
  }
  if (choice !== 'keep') return { format: choice, changed: false };
  if (source === 'jpeg' || source === 'png') return { format: source, changed: false };
  if (source === 'webp' && facts.webp) return { format: 'webp', changed: false };
  return { format: fallback(facts), changed: true };
}

export const EXTENSION: Record<EncodeFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
export const MIME: Record<EncodeFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** 原文件名换成新扩展名；路径里不允许的字符替换掉 */
export function outputName(fileName: string, format: EncodeFormat): string {
  const base = fileName.replace(/\.[^./\\]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'image';
  return `${base}.${EXTENSION[format]}`;
}

/** 文件夹里的相对路径（a/b/c.png）→ 所在目录（a/b/），没有目录返回空串 */
export function directoryOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash < 0 ? '' : relativePath.slice(0, slash + 1);
}

/** JPEG / WebP 的编码质量 */
export const QUALITY: Record<QualityPreset, number> = { high: 0.9, standard: 0.8, small: 0.65 };

/** PNG 的颜色数：0 表示无损（颜色本来就不超过 256 时仍会无损地换成调色板） */
export const PNG_COLORS: Record<QualityPreset, number> = { high: 0, standard: 256, small: 64 };

/** 按目标大小找画质时的范围：低于 0.3 糊得没法用，高于 0.92 体积涨得多、看不出区别 */
export const TARGET_QUALITY_MIN = 0.3;
export const TARGET_QUALITY_MAX = 0.92;
/** 按目标大小找 PNG 时依次试的颜色数 */
export const TARGET_PNG_COLORS: readonly number[] = [0, 256, 128, 64, 32];

export interface Sized {
  readonly size: number;
}

/**
 * 在 [lo, hi] 里二分找能压到 target 以内的最高质量。
 * 最高质量已经够小就直接用；最低质量还超就返回最低质量的结果并标记 fits=false。
 */
export async function searchQuality<T extends Sized>(
  encode: (quality: number) => Promise<T>,
  target: number,
  lo = TARGET_QUALITY_MIN,
  hi = TARGET_QUALITY_MAX,
  steps = 6,
): Promise<{ result: T; quality: number; fits: boolean }> {
  const top = await encode(hi);
  if (top.size <= target) return { result: top, quality: hi, fits: true };
  const bottom = await encode(lo);
  if (bottom.size > target) return { result: bottom, quality: lo, fits: false };
  let best = { result: bottom, quality: lo };
  let low = lo;
  let high = hi;
  for (let i = 0; i < steps; i++) {
    const mid = (low + high) / 2;
    const attempt = await encode(mid);
    if (attempt.size <= target) {
      best = { result: attempt, quality: mid };
      low = mid;
    } else {
      high = mid;
    }
  }
  return { ...best, fits: true };
}

/** 依次试候选，返回第一个够小的；都不够小返回最小的那个 */
export async function firstFit<C, T extends Sized>(
  candidates: readonly C[],
  encode: (candidate: C) => Promise<T>,
  target: number,
): Promise<{ result: T; candidate: C; fits: boolean }> {
  let smallest: { result: T; candidate: C } | null = null;
  for (const candidate of candidates) {
    const result = await encode(candidate);
    if (result.size <= target) return { result, candidate, fits: true };
    if (smallest === null || result.size < smallest.result.size) smallest = { result, candidate };
  }
  if (smallest === null) throw new Error('no candidates');
  return { ...smallest, fits: false };
}

/**
 * 最低画质还压不到目标时，按体积比例估一个缩小倍数：体积大致和像素数成正比，
 * 边长按平方根缩，再留一点余量；一次最多缩到一半，免得一步缩过头。
 */
export function shrinkFactor(size: number, target: number): number {
  return Math.min(0.9, Math.max(0.5, Math.sqrt(target / size) * 0.92));
}

/** 不变大保护：没要求改格式、尺寸、背景，结果又不比原图小，就直接给原图 */
export function keepOriginal(input: {
  readonly sourceFormat: SourceFormat;
  readonly format: EncodeFormat;
  readonly planChanged: boolean;
  readonly backgroundChanged: boolean;
  readonly originalSize: number;
  readonly outputSize: number;
}): boolean {
  return (
    input.sourceFormat === input.format &&
    !input.planChanged &&
    !input.backgroundChanged &&
    input.outputSize >= input.originalSize
  );
}
