import type {
  ExactFit,
  ImageJobOptions,
  OutputChoice,
  QualityPreset,
  ResizeMode,
} from '../core/image/plan.ts';
import { clampInt } from '../core/util/number.ts';
import type { ImageToolId } from './tools.ts';

/**
 * 图片工具界面上的设置，以及它们怎样变成处理参数。纯函数，不依赖 React，单测直接喂对象。
 *
 * 三个工具各自只露出一项核心设置，「更多选项」里也只有一项，其余固定成合理的默认：
 * - 压缩：画质（高清 / 标准 / 小体积 / 指定大小）；更多选项里改输出格式；
 * - 转换：转成 JPG / PNG / WebP，选 JPG 时顺带给透明部分选个底色；更多选项里改画质；
 * - 改尺寸：长边 / 宽 / 高 / 百分比 / 精确尺寸；更多选项里写 DPI。
 * 设置项少，用户不用琢磨；需要组合时先压缩、再转换即可。
 */
export interface ImageSettings {
  readonly quality: QualityPreset;
  /** 压缩时选了「指定大小」 */
  readonly target: boolean;
  /** KB */
  readonly targetKb: number;
  readonly output: OutputChoice;
  /** 转成 JPG 时透明部分填的颜色 */
  readonly color: string;
  readonly resize: Exclude<ResizeMode, 'none'>;
  readonly size: number;
  readonly percent: number;
  readonly exactWidth: number;
  readonly exactHeight: number;
  readonly fit: ExactFit;
  readonly dpi: number;
}

const BASE: ImageSettings = {
  quality: 'standard',
  target: false,
  targetKb: 500,
  output: 'keep',
  color: '#ffffff',
  resize: 'long',
  size: 1920,
  percent: 50,
  exactWidth: 1080,
  exactHeight: 1080,
  fit: 'cover',
  dpi: 0,
};

export const IMAGE_DEFAULTS: Readonly<Record<ImageToolId, ImageSettings>> = {
  'compress-images': BASE,
  'convert-images': { ...BASE, output: 'jpeg', quality: 'high' },
  'resize-images': BASE,
};

export const COMPRESS_OUTPUTS: readonly OutputChoice[] = ['keep', 'jpeg', 'png', 'webp'];
export const CONVERT_OUTPUTS: readonly OutputChoice[] = ['jpeg', 'png', 'webp'];
export const QUALITIES: readonly QualityPreset[] = ['high', 'standard', 'small'];
/** 压缩的画质档位多一个「指定大小」 */
export type CompressLevel = QualityPreset | 'target';
export const LEVELS: readonly CompressLevel[] = ['high', 'standard', 'small', 'target'];
export const RESIZES: readonly ImageSettings['resize'][] = [
  'long',
  'width',
  'height',
  'percent',
  'exact',
];
export const FITS: readonly ExactFit[] = ['cover', 'contain'];
export const DPIS = ['0', '72', '96', '150', '300'] as const;
export type DpiValue = (typeof DPIS)[number];
export const SIZE_PRESETS: readonly number[] = [1280, 1920, 2560, 3840];
export const TARGET_KB = { min: 10, max: 102_400 } as const;

/** 用户不能改的部分：不缩放、不填色、不写 DPI、画质按高清 */
const FIXED: ImageJobOptions = {
  output: 'keep',
  quality: 'high',
  targetBytes: 0,
  resize: 'none',
  size: 1920,
  percent: 100,
  exactWidth: 1080,
  exactHeight: 1080,
  fit: 'cover',
  background: 'keep',
  color: '#ffffff',
  dpi: 0,
  keepUnchanged: true,
};

/**
 * 只取这个工具露出来的设置，别的一律用固定值：以前版本存下的其他设置不会悄悄生效。
 * 压缩总要重新编码试一试；转换和改尺寸遇到本来就符合的图原样保留，不白白损失画质。
 */
export function toJob(s: ImageSettings, tool: ImageToolId): ImageJobOptions {
  switch (tool) {
    case 'compress-images':
      return {
        ...FIXED,
        output: s.output,
        quality: s.quality,
        targetBytes: s.target ? Math.round(s.targetKb * 1024) : 0,
        keepUnchanged: false,
      };
    case 'convert-images':
      return { ...FIXED, output: s.output, quality: s.quality, color: s.color };
    case 'resize-images':
      return {
        ...FIXED,
        resize: s.resize,
        size: s.size,
        percent: s.percent,
        exactWidth: s.exactWidth,
        exactHeight: s.exactHeight,
        fit: s.fit,
        dpi: s.dpi,
      };
  }
}

/** 「更多选项」里那一项改过没有：改过就亮点，打开页面时直接展开 */
export function moreChanged(s: ImageSettings, tool: ImageToolId): boolean {
  const d = IMAGE_DEFAULTS[tool];
  if (tool === 'compress-images') return s.output !== d.output;
  if (tool === 'convert-images') return s.quality !== d.quality;
  return s.dpi !== d.dpi;
}

/** 和默认设置相比，处理结果会不会不一样（只改了没生效的数值不算） */
export function changedFromDefaults(s: ImageSettings, tool: ImageToolId): boolean {
  return JSON.stringify(toJob(s, tool)) !== JSON.stringify(toJob(IMAGE_DEFAULTS[tool], tool));
}

const oneOf = <T>(list: readonly T[], value: T, fallback: T): T =>
  list.includes(value) ? value : fallback;

/** 读出来的旧设置逐项校验：不认识的枚举、越界的数字都换回这个工具的默认值 */
export function fixSettings(tool: ImageToolId): (o: ImageSettings) => ImageSettings {
  const d = IMAGE_DEFAULTS[tool];
  const outputs = tool === 'convert-images' ? CONVERT_OUTPUTS : COMPRESS_OUTPUTS;
  return (o) => ({
    quality: oneOf(QUALITIES, o.quality, d.quality),
    target: o.target === true,
    targetKb: clampInt(o.targetKb, TARGET_KB.min, TARGET_KB.max, d.targetKb),
    output: oneOf(outputs, o.output, d.output),
    color: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : d.color,
    resize: oneOf(RESIZES, o.resize, d.resize),
    size: clampInt(o.size, 16, 16384, d.size),
    percent: clampInt(o.percent, 1, 100, d.percent),
    exactWidth: clampInt(o.exactWidth, 1, 16384, d.exactWidth),
    exactHeight: clampInt(o.exactHeight, 1, 16384, d.exactHeight),
    fit: oneOf(FITS, o.fit, d.fit),
    dpi: oneOf([0, 72, 96, 150, 300], o.dpi, d.dpi),
  });
}
