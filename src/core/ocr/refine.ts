/**
 * OCR 结果的像素级修正。识别引擎只给文字和框，粗细、颜色都要回到渲染图上量：
 * - 红章、红头等红色墨迹上认出的零碎字（"信息科"、"业"）不是正文，丢掉
 * - 置信度很低的一两个字（印章残片、污点）丢掉
 * - 墨迹密度明显高于本页正文的行判为粗体，供标题识别用
 */
import type { BBox } from '../contracts/geometry.ts';
import type { PrimitiveTextSpan } from '../contracts/primitives.ts';
import { median } from '../geometry/stats.ts';
import { isCjkChar } from '../util/cjk.ts';
import { normalizeOcrBullets } from './engine.ts';

export interface InkStats {
  /** 深色墨迹像素占墨迹包络（有墨迹的行列范围）面积的比例；没墨迹时为 0 */
  readonly density: number;
  /** 红色像素占全部墨迹像素的比例；没墨迹时为 0 */
  readonly red: number;
  /** 墨迹像素总数（深色 + 红色） */
  readonly ink: number;
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

const EMPTY: InkStats = { density: 0, red: 0, ink: 0 };

/**
 * 量一个框里的墨迹。密度按墨迹包络算而不是按整个框算：
 * OCR 框松紧不一（勾选框、印章都会把框撑大），按框面积算密度会随之抖动。
 */
export function measureInk(
  ctx: Ctx2D,
  bbox: BBox,
  scale: number,
  canvasWidth: number,
  canvasHeight: number,
): InkStats {
  const x0 = Math.max(0, Math.floor(bbox.x * scale));
  const y0 = Math.max(0, Math.floor(bbox.y * scale));
  const x1 = Math.min(canvasWidth, Math.ceil((bbox.x + bbox.width) * scale));
  const y1 = Math.min(canvasHeight, Math.ceil((bbox.y + bbox.height) * scale));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return EMPTY;

  const data = ctx.getImageData(x0, y0, w, h).data;
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  let dark = 0;
  let red = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 110 && r - g > 50 && r - b > 50) {
        red++;
      } else if (r + g + b < 420) {
        dark++;
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const ink = dark + red;
  if (dark === 0) return { density: 0, red: ink > 0 ? 1 : 0, ink };

  // 包络：有足够墨迹的首末行、首末列。阈值挡掉单像素噪点
  const rowMin = Math.max(1, w * 0.02);
  const colMin = Math.max(1, h * 0.02);
  let top = 0;
  while (top < h && rows[top] < rowMin) top++;
  let bottom = h - 1;
  while (bottom > top && rows[bottom] < rowMin) bottom--;
  let left = 0;
  while (left < w && cols[left] < colMin) left++;
  let right = w - 1;
  while (right > left && cols[right] < colMin) right--;
  const area = Math.max(1, (bottom - top + 1) * (right - left + 1));

  return { density: Math.min(1, dark / area), red: red / ink, ink };
}

/** 置信度低于这个值的短片段当噪点 */
const LOW_CONFIDENCE = 0.55;
/** 短片段的字数上限 */
const SHORT_CHARS = 4;
/** 墨迹里红色占比超过这个值就是印章 / 红字 */
const RED_INK_RATIO = 0.6;
/** 页面上旋转片段占比低于这个值时，旋转的短片段才当噪点（整页旋转的另算） */
const ROTATED_MINORITY = 0.3;
/** 墨迹密度达到本页正文中位数的这个倍数判为粗体 */
const BOLD_DENSITY_RATIO = 1.3;
/** 至少有这么多行可比，粗体判断才有意义 */
const MIN_BOLD_SAMPLES = 5;
/** 墨迹像素少于这个数的片段不判粗体（几个点的密度没意义） */
const MIN_BOLD_INK = 100;
/** 少于这么多字的片段不判粗体："视频"、"图片"这种两个字的密度全看那两个字的笔画多少 */
const MIN_BOLD_CHARS = 3;

function charCount(span: PrimitiveTextSpan): number {
  return span.text.trim().length;
}

function cjkCount(span: PrimitiveTextSpan): number {
  let n = 0;
  for (const ch of span.text) if (isCjkChar(ch)) n++;
  return n;
}

function isRotated(span: PrimitiveTextSpan): boolean {
  return span.vertical || (span.rotation >= 1 && span.rotation <= 359);
}

/**
 * 是否为噪点。规则只碰"短、旋转、低置信"这几类，长的正文行无论如何都留着：
 * 认错了的正文用户还能改，丢了就找不回来。
 * 红墨只是加权：印章上的字要么歪着要么认不准，红色本身不算数——
 * 行情表里红色的跌幅、红头文件的标题都是横平竖直、高置信的正经文字。
 */
export function isOcrNoise(
  span: PrimitiveTextSpan,
  ink: InkStats | null,
  rotatedMinority: boolean,
): boolean {
  const chars = charCount(span);
  const short = chars <= SHORT_CHARS;
  const rotated = rotatedMinority && isRotated(span);
  if (short && span.confidence < LOW_CONFIDENCE) return true;
  if (short && rotated) return true;
  if (ink !== null && ink.ink > 0 && ink.red >= RED_INK_RATIO) {
    return span.confidence < 0.8 || rotated;
  }
  return false;
}

/**
 * 按墨迹密度标粗体：和本页正文行的中位数比。
 * 黑体标题的笔画比宋体正文粗得多，这一条就把中文文档里绝大多数标题认出来了。
 * 基准只取 4 个汉字以上的行：西文、代码行的密度低得多，混进来会把基准拉低，
 * 让全是汉字的普通短行误判成粗体；页面上没有中文行时才退回用所有 4 字以上的行。
 */
export function markBoldByInk(
  spans: readonly PrimitiveTextSpan[],
  inks: readonly (InkStats | null)[],
): PrimitiveTextSpan[] {
  const usable = (i: number): boolean => {
    const ink = inks[i];
    return ink !== null && ink.density > 0 && charCount(spans[i]) >= 4 && !isRotated(spans[i]);
  };
  const cjkSamples: number[] = [];
  const allSamples: number[] = [];
  spans.forEach((span, i) => {
    if (!usable(i)) return;
    const density = (inks[i] as InkStats).density;
    allSamples.push(density);
    if (cjkCount(span) >= 4) cjkSamples.push(density);
  });
  const samples = cjkSamples.length >= MIN_BOLD_SAMPLES ? cjkSamples : allSamples;
  if (samples.length < MIN_BOLD_SAMPLES) return [...spans];
  const reference = median(samples);
  if (reference <= 0) return [...spans];
  return spans.map((span, i) => {
    const ink = inks[i];
    const bold =
      ink !== null &&
      ink.ink >= MIN_BOLD_INK &&
      charCount(span) >= MIN_BOLD_CHARS &&
      !isRotated(span) &&
      ink.density >= reference * BOLD_DENSITY_RATIO;
    return bold === span.bold ? span : { ...span, bold };
  });
}

/** 对一页（或一条）识别结果做像素级修正：认项目符号，去噪点，标粗体 */
export function refineOcrSpans(
  rawSpans: readonly PrimitiveTextSpan[],
  canvas: OffscreenCanvas,
  scale: number,
): PrimitiveTextSpan[] {
  if (rawSpans.length === 0) return [];
  // 项目符号先认：它本来就是置信度很低的一个小字，不先认就会被当噪点丢掉
  const spans = normalizeOcrBullets(rawSpans);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const inks: (InkStats | null)[] = spans.map((span) =>
    ctx === null ? null : measureInk(ctx, span.bbox, scale, canvas.width, canvas.height),
  );
  const rotated = spans.filter(isRotated).length;
  const rotatedMinority = rotated / spans.length < ROTATED_MINORITY;

  const kept: PrimitiveTextSpan[] = [];
  const keptInks: (InkStats | null)[] = [];
  spans.forEach((span, i) => {
    if (isOcrNoise(span, inks[i], rotatedMinority)) return;
    kept.push(span);
    keptInks.push(inks[i]);
  });
  return markBoldByInk(kept, keptInks);
}
