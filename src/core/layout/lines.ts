import type { PrimitiveTextSpan } from '../contracts/primitives.ts';
import type { TextLine } from '../contracts/layout.ts';
import { overlapRatio1D, right, unionBBox } from '../geometry/bbox.ts';
import { median } from '../geometry/stats.ts';
import { joinSpans } from './text.ts';

/** 认为处于同一基线的最大偏差，相对该行最大字号 */
const BASELINE_TOLERANCE_RATIO = 0.35;
/**
 * 上下标（脚注序号、化学式）的字号明显小于正文，基线却抬高或压低将近半个字：
 * 字号相差悬殊的两个片段用这个更宽的容差
 */
const SUPERSCRIPT_TOLERANCE_RATIO = 0.6;
const SUPERSCRIPT_SIZE_RATIO = 0.8;
/** 同一行内允许的最大字间距（字宽倍数），超过就认为跨到了另一栏 / 另一格 */
const INTRA_LINE_GAP_EM = 2.5;
/** 同上，绝对下限（pt），避免小字号页面被切碎 */
const MIN_SPLIT_GAP = 18;

export interface LineBuildResult {
  readonly lines: TextLine[];
  /** 非 0 旋转的 span 数量，用于给出降级警告 */
  readonly rotatedSpanCount: number;
  readonly verticalSpanCount: number;
  /** 页面上找到的栏间空隙，分栏切分时不论宽窄都认 */
  readonly gutters: readonly ColumnGutter[];
}

function isHorizontal(span: PrimitiveTextSpan): boolean {
  return !span.vertical && (span.rotation < 1 || span.rotation > 359);
}

/**
 * 行聚类的尺度用字号和框高里大的那个：原生文字两者相当；
 * OCR 框比字号高出两三成，基线也跟着框抖，容差按字号算会把同一行的相邻格子拆开
 */
function spanScale(span: PrimitiveTextSpan): number {
  return Math.max(span.fontSize, span.bbox.height);
}

/**
 * span → 文本行。基线聚类比 bbox 聚类稳：上下标、混排字号都不会把一行拆开。
 * 页面旋转已在抽取阶段归一化，这里剩下的非 0 旋转是页内真正的旋转文字，
 * 单独成行并计数，由上层给出降级警告。
 */
export function buildLines(
  spans: readonly PrimitiveTextSpan[],
  pageWidth?: number,
): LineBuildResult {
  const horizontal: PrimitiveTextSpan[] = [];
  const others: PrimitiveTextSpan[] = [];
  let verticalSpanCount = 0;

  for (const span of spans) {
    if (span.text.trim() === '') continue;
    if (isHorizontal(span)) horizontal.push(span);
    else {
      if (span.vertical) verticalSpanCount++;
      others.push(span);
    }
  }

  const sorted = [...horizontal].sort((a, b) => a.baseline - b.baseline || a.bbox.x - b.bbox.x);
  const groups: PrimitiveTextSpan[][] = [];
  let current: PrimitiveTextSpan[] = [];
  let currentBaseline = 0;
  let currentFontSize = 0;
  let currentTop = 0;
  let currentBottom = 0;

  for (const span of sorted) {
    if (current.length === 0) {
      current = [span];
      currentBaseline = span.baseline;
      currentFontSize = spanScale(span);
      currentTop = span.bbox.y;
      currentBottom = span.bbox.y + span.bbox.height;
      continue;
    }
    const tolerance = baselineTolerance(currentFontSize, spanScale(span));
    const vertical = overlapRatio1D(
      currentTop,
      currentBottom,
      span.bbox.y,
      span.bbox.y + span.bbox.height,
    );
    if (Math.abs(span.baseline - currentBaseline) <= tolerance && vertical > 0.3) {
      current.push(span);
      // 基线取平均，避免长行被首个 span 的基线带偏
      currentBaseline = current.reduce((s, x) => s + x.baseline, 0) / current.length;
      currentFontSize = Math.max(currentFontSize, spanScale(span));
      currentTop = Math.min(currentTop, span.bbox.y);
      currentBottom = Math.max(currentBottom, span.bbox.y + span.bbox.height);
    } else {
      groups.push(current);
      current = [span];
      currentBaseline = span.baseline;
      currentFontSize = spanScale(span);
      currentTop = span.bbox.y;
      currentBottom = span.bbox.y + span.bbox.height;
    }
  }
  if (current.length > 0) groups.push(current);

  const gutters = findColumnGutters(horizontal, pageWidth);
  const lines = groups
    .flatMap((group) => splitOnWideGaps(group, gutters))
    .map((group, i) => makeLine(group, i));
  for (const span of others) {
    lines.push(makeLine([span], lines.length));
  }
  lines.sort((a, b) => a.baseline - b.baseline || a.bbox.x - b.bbox.x);

  return {
    lines,
    rotatedSpanCount: others.length - verticalSpanCount,
    verticalSpanCount,
    gutters,
  };
}

/** 容差按较大的字号算：上下标的字号小、基线偏移却是按正文字号来的 */
function baselineTolerance(a: number, b: number): number {
  const larger = Math.max(a, b);
  const smaller = Math.min(a, b);
  const ratio =
    smaller < larger * SUPERSCRIPT_SIZE_RATIO
      ? SUPERSCRIPT_TOLERANCE_RATIO
      : BASELINE_TOLERANCE_RATIO;
  return Math.max(1, larger * ratio);
}

export interface ColumnGutter {
  readonly start: number;
  readonly end: number;
}

/** 栏间空隙至少多宽（字宽倍数与绝对值取大者） */
const GUTTER_MIN_EM = 0.5;
const GUTTER_MIN_PT = 6;
/** 空隙两侧各至少有这么多个片段贴着它，才算栏间空隙 */
const GUTTER_MIN_ADJACENT = 4;
/** 贴着空隙的片段里至少有这么多条是真正的文字行（字数够多），排除数字表格的列间隙 */
const GUTTER_MIN_LONG_LINES = 3;
const GUTTER_LONG_CHARS = 15;
/** 片段边缘离空隙边缘不超过这么多字宽就算"贴着" */
const GUTTER_ADJACENT_EM = 1.2;
/** 允许横跨空隙的片段比例（页眉页脚、跨栏标题） */
const GUTTER_CROSSING_RATIO = 0.04;
/** 空隙只在页面文字范围的中间这一段找，边上的留白不算 */
const GUTTER_EDGE_RATIO = 0.15;
/** 比页宽的这个比例还宽的片段是跨栏的（标题、通栏脚注），横穿空隙不算数；不知道页宽时按文字宽度的 0.75 */
const WIDE_SPAN_RATIO = 0.6;
const WIDE_SPAN_TEXT_RATIO = 0.75;

/**
 * 找页面上的栏间空隙：文字水平投影里几乎没有片段覆盖、两侧都贴着不少文字行的竖直空白带。
 * 双栏正文、正文加侧栏的研报，左右两栏的基线经常完全对齐，间距又不到两三个字宽，
 * 光按间距拆不开，会连成一条跨栏的"行"，后面的分栏检测再也找不到那条竖向空隙。
 * 表格列之间也有这种空白，但两侧都是短短的单元格文字，用"贴着空隙的长行"把它排除。
 * 跨栏的标题和通栏的脚注块横穿空隙，但它们本身是一个片段，拆不到，也不该让空隙消失。
 */
export function findColumnGutters(
  spans: readonly PrimitiveTextSpan[],
  pageWidth?: number,
): ColumnGutter[] {
  if (spans.length < 2 * GUTTER_MIN_ADJACENT) return [];
  const minX = Math.min(...spans.map((s) => s.bbox.x));
  const maxX = Math.max(...spans.map((s) => right(s.bbox)));
  const width = maxX - minX;
  const em = median(spans.map((s) => s.fontSize)) || 10;
  if (width < em * 20) return [];
  const wideLimit =
    pageWidth !== undefined && pageWidth > 0
      ? pageWidth * WIDE_SPAN_RATIO
      : width * WIDE_SPAN_TEXT_RATIO;

  const cover = new Int32Array(Math.ceil(width) + 2);
  let wide = 0;
  for (const span of spans) {
    if (span.bbox.width > wideLimit) wide++;
    const from = Math.max(0, Math.floor(span.bbox.x - minX));
    const to = Math.min(cover.length - 1, Math.ceil(right(span.bbox) - minX));
    for (let x = from; x <= to; x++) cover[x]++;
  }

  // 跨栏的片段横穿每一个位置，不能让它们把空隙盖没
  const allowed = wide + Math.max(1, Math.floor((spans.length - wide) * GUTTER_CROSSING_RATIO));
  const minWidth = Math.max(GUTTER_MIN_PT, em * GUTTER_MIN_EM);
  const lower = minX + width * GUTTER_EDGE_RATIO;
  const upper = maxX - width * GUTTER_EDGE_RATIO;
  const gutters: ColumnGutter[] = [];
  let runStart = -1;
  for (let x = 0; x <= cover.length; x++) {
    const empty = x < cover.length && cover[x] <= allowed;
    if (empty && runStart < 0) runStart = x;
    if (!empty && runStart >= 0) {
      const start = minX + runStart;
      const end = minX + x;
      runStart = -1;
      if (end - start < minWidth || start < lower || end > upper) continue;
      if (isColumnGutter(spans, start, end, em)) gutters.push({ start, end });
    }
  }
  return gutters;
}

function isColumnGutter(
  spans: readonly PrimitiveTextSpan[],
  start: number,
  end: number,
  em: number,
): boolean {
  const reach = em * GUTTER_ADJACENT_EM;
  const leftAdjacent = spans.filter(
    (s) => right(s.bbox) <= start + 0.5 && right(s.bbox) >= start - reach,
  );
  const rightAdjacent = spans.filter((s) => s.bbox.x >= end - 0.5 && s.bbox.x <= end + reach);
  if (leftAdjacent.length < GUTTER_MIN_ADJACENT || rightAdjacent.length < GUTTER_MIN_ADJACENT)
    return false;

  const longLines = (list: readonly PrimitiveTextSpan[]): number =>
    list.filter((s) => s.text.trim().length >= GUTTER_LONG_CHARS).length;
  if (
    longLines(leftAdjacent) < GUTTER_MIN_LONG_LINES &&
    longLines(rightAdjacent) < GUTTER_MIN_LONG_LINES
  )
    return false;

  // 两侧的文字要在同一段高度上并排，上下错开的不是分栏
  const span = (list: readonly PrimitiveTextSpan[]): [number, number] => [
    Math.min(...list.map((s) => s.bbox.y)),
    Math.max(...list.map((s) => s.bbox.y + s.bbox.height)),
  ];
  const [l0, l1] = span(leftAdjacent);
  const [r0, r1] = span(rightAdjacent);
  return Math.min(l1, r1) - Math.max(l0, r0) >= em * 2.5;
}

/**
 * 同一基线上间距过大、或者隔着栏间空隙的片段拆成两行。
 * 双栏排版里左右两栏的基线经常完全对齐，不拆就会连成一条跨栏的"行"，
 * 后面的分栏检测再也找不到那条竖向空隙。
 */
function splitOnWideGaps(
  group: readonly PrimitiveTextSpan[],
  gutters: readonly ColumnGutter[],
): PrimitiveTextSpan[][] {
  if (group.length < 2) return [[...group]];
  const ordered = [...group].sort((a, b) => a.bbox.x - b.bbox.x);
  const out: PrimitiveTextSpan[][] = [[ordered[0]]];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const span = ordered[i];
    const prevRight = prev.bbox.x + prev.bbox.width;
    const gap = span.bbox.x - prevRight;
    const em = Math.max(spanScale(prev), spanScale(span)) || 10;
    const acrossGutter = gutters.some((g) => prevRight <= g.start + 1 && span.bbox.x >= g.end - 1);
    if (gap > Math.max(em * INTRA_LINE_GAP_EM, MIN_SPLIT_GAP) || acrossGutter) out.push([span]);
    else out[out.length - 1].push(span);
  }
  return out;
}

export function makeLine(group: readonly PrimitiveTextSpan[], seq: number): TextLine {
  const ordered = [...group].sort((a, b) => a.bbox.x - b.bbox.x);
  const bbox = unionBBox(ordered.map((s) => s.bbox));
  const text = joinSpans(ordered).replace(/\s+$/, '');
  const fontSize = median(ordered.map((s) => s.fontSize));
  const weightedBold = ordered.filter((s) => s.bold).reduce((sum, s) => sum + s.text.length, 0);
  const totalChars = ordered.reduce((sum, s) => sum + s.text.length, 0) || 1;
  const dominant = ordered.reduce((a, b) => (b.text.length > a.text.length ? b : a), ordered[0]);

  return {
    id: `${ordered[0].pageIndex}-l${seq}`,
    pageIndex: ordered[0].pageIndex,
    text,
    bbox,
    baseline: ordered.reduce((s, x) => s + x.baseline, 0) / ordered.length,
    fontSize,
    bold: weightedBold / totalChars > 0.6,
    italic: ordered.filter((s) => s.italic).length > ordered.length / 2,
    fontName: dominant.fontName,
    spanIds: ordered.map((s) => s.id),
    spans: ordered,
  };
}
