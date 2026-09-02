import type { PrimitiveTextSpan } from '../contracts/primitives.ts';
import type { TextLine } from '../contracts/layout.ts';
import { overlapRatio1D, unionBBox } from '../geometry/bbox.ts';
import { median } from '../geometry/stats.ts';
import { joinSpans } from './text.ts';

/** 认为处于同一基线的最大偏差，相对该行最大字号 */
const BASELINE_TOLERANCE_RATIO = 0.35;
/** 同一行内允许的最大字间距（字宽倍数），超过就认为跨到了另一栏 / 另一格 */
const INTRA_LINE_GAP_EM = 2.5;
/** 同上，绝对下限（pt），避免小字号页面被切碎 */
const MIN_SPLIT_GAP = 18;

export interface LineBuildResult {
  readonly lines: TextLine[];
  /** 非 0 旋转的 span 数量，用于给出降级警告 */
  readonly rotatedSpanCount: number;
  readonly verticalSpanCount: number;
}

function isHorizontal(span: PrimitiveTextSpan): boolean {
  return !span.vertical && (span.rotation < 1 || span.rotation > 359);
}

/**
 * span → 文本行。基线聚类比 bbox 聚类稳：上下标、混排字号都不会把一行拆开。
 * 页面旋转已在抽取阶段归一化，这里剩下的非 0 旋转是页内真正的旋转文字，
 * 单独成行并计数，由上层给出降级警告。
 */
export function buildLines(spans: readonly PrimitiveTextSpan[]): LineBuildResult {
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
      currentFontSize = span.fontSize;
      currentTop = span.bbox.y;
      currentBottom = span.bbox.y + span.bbox.height;
      continue;
    }
    // 容差按较大的字号算：上下标的字号小、基线偏移却是按正文字号来的
    const tolerance = Math.max(
      1,
      Math.max(currentFontSize, span.fontSize) * BASELINE_TOLERANCE_RATIO,
    );
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
      currentFontSize = Math.max(currentFontSize, span.fontSize);
      currentTop = Math.min(currentTop, span.bbox.y);
      currentBottom = Math.max(currentBottom, span.bbox.y + span.bbox.height);
    } else {
      groups.push(current);
      current = [span];
      currentBaseline = span.baseline;
      currentFontSize = span.fontSize;
      currentTop = span.bbox.y;
      currentBottom = span.bbox.y + span.bbox.height;
    }
  }
  if (current.length > 0) groups.push(current);

  const lines = groups.flatMap(splitOnWideGaps).map((group, i) => makeLine(group, i));
  for (const span of others) {
    lines.push(makeLine([span], lines.length));
  }
  lines.sort((a, b) => a.baseline - b.baseline || a.bbox.x - b.bbox.x);

  return { lines, rotatedSpanCount: others.length - verticalSpanCount, verticalSpanCount };
}

/**
 * 同一基线上间距过大的片段拆成两行。
 * 双栏排版里左右两栏的基线经常完全对齐，不拆就会连成一条跨栏的"行"，
 * 后面的分栏检测再也找不到那条竖向空隙。
 */
function splitOnWideGaps(group: readonly PrimitiveTextSpan[]): PrimitiveTextSpan[][] {
  if (group.length < 2) return [[...group]];
  const ordered = [...group].sort((a, b) => a.bbox.x - b.bbox.x);
  const out: PrimitiveTextSpan[][] = [[ordered[0]]];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const span = ordered[i];
    const gap = span.bbox.x - (prev.bbox.x + prev.bbox.width);
    const em = Math.max(prev.fontSize, span.fontSize) || 10;
    if (gap > Math.max(em * INTRA_LINE_GAP_EM, MIN_SPLIT_GAP)) out.push([span]);
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
