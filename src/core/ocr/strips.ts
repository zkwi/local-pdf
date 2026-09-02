import type { PrimitiveTextSpan } from '../contracts/primitives.ts';

/** 每条的高度（pt），约一张 A4；条与条之间重叠一点，避免正好切在一行文字中间 */
export const STRIP_HEIGHT_PT = 720;
export const STRIP_OVERLAP_PT = 30;
/** 页高超过这个值才分条；普通页面整页渲染更快 */
export const STRIP_THRESHOLD_PT = STRIP_HEIGHT_PT * 1.5;

export interface StripPlan {
  readonly top: number;
  readonly height: number;
}

export function planStrips(pageHeight: number): StripPlan[] {
  const strips: StripPlan[] = [];
  const step = STRIP_HEIGHT_PT - STRIP_OVERLAP_PT;
  for (let top = 0; top < pageHeight; top += step) {
    const height = Math.min(STRIP_HEIGHT_PT, pageHeight - top);
    strips.push({ top, height });
    if (top + height >= pageHeight) break;
  }
  return strips;
}

export interface StripResult {
  readonly plan: StripPlan;
  /** 条内坐标（y 从条顶算起） */
  readonly spans: readonly PrimitiveTextSpan[];
}

/** 距条边这么近的框可能被切断了，交给相邻那条来认 */
const EDGE_MARGIN_PT = 3;

/**
 * 把各条的识别结果换算回页面坐标并去重：
 * 贴着条边（可能被切断）的丢掉，重叠区里两条都认全的取先出现的那份。
 */
export function mergeStripSpans(
  results: readonly StripResult[],
  pageHeight: number,
  pageIndex: number,
): PrimitiveTextSpan[] {
  const kept: PrimitiveTextSpan[] = [];
  results.forEach((result, stripIndex) => {
    const { top, height } = result.plan;
    const bottomEdge = top + height;
    const hasPrev = stripIndex > 0;
    const hasNext = bottomEdge < pageHeight - 0.5;
    for (const span of result.spans) {
      const y = span.bbox.y + top;
      const y1 = y + span.bbox.height;
      if (hasPrev && y < top + EDGE_MARGIN_PT) continue;
      if (hasNext && y1 > bottomEdge - EDGE_MARGIN_PT) continue;
      const moved: PrimitiveTextSpan = {
        ...span,
        id: `p${pageIndex}-ocr${kept.length}`,
        bbox: { ...span.bbox, y },
        baseline: span.baseline + top,
      };
      if (kept.some((k) => iou(k, moved) > 0.5)) continue;
      kept.push(moved);
    }
  });
  return kept.sort((a, b) => a.baseline - b.baseline || a.bbox.x - b.bbox.x);
}

function iou(a: PrimitiveTextSpan, b: PrimitiveTextSpan): number {
  const x0 = Math.max(a.bbox.x, b.bbox.x);
  const y0 = Math.max(a.bbox.y, b.bbox.y);
  const x1 = Math.min(a.bbox.x + a.bbox.width, b.bbox.x + b.bbox.width);
  const y1 = Math.min(a.bbox.y + a.bbox.height, b.bbox.y + b.bbox.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter === 0) return 0;
  const union = a.bbox.width * a.bbox.height + b.bbox.width * b.bbox.height - inter;
  return union > 0 ? inter / union : 0;
}
