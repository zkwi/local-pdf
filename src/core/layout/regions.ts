import type { BBox } from '../contracts/geometry.ts';
import type { TextLine } from '../contracts/layout.ts';
import { bottom, right, unionBBox } from '../geometry/bbox.ts';
import { median } from '../geometry/stats.ts';

export interface Region {
  readonly bbox: BBox;
  readonly lines: TextLine[];
}

export interface RegionResult {
  readonly regions: Region[];
  readonly columnCount: number;
  /** 0~1，低于 0.6 建议提示用户人工确认分栏 */
  readonly confidence: number;
}

interface Gap {
  readonly start: number;
  readonly end: number;
  readonly size: number;
}

/** 在一维上找出所有没有任何 box 覆盖的空隙 */
function findGaps(
  intervals: readonly (readonly [number, number])[],
  lower: number,
  upper: number,
): Gap[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const gaps: Gap[] = [];
  let reach = sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s > reach) gaps.push({ start: reach, end: s, size: s - reach });
    reach = Math.max(reach, e);
  }
  // 只关心内部空隙，边缘留白不是切分依据
  return gaps.filter((g) => g.start > lower && g.end < upper);
}

const MAX_DEPTH = 8;

/**
 * XY-Cut 版面切分。先找竖向空隙（分栏），找不到再找横向空隙（段落带）。
 *
 * 竖向优先是有意的：双栏页面上方常有跨栏标题，带着标题时不存在贯通的竖向空隙，
 * 于是自动退化成"先横切出标题带，再在下半部分竖切出两栏"，正是我们想要的顺序。
 */
export function segmentRegions(
  lines: readonly TextLine[],
  pageWidth: number,
  minColumnGap?: number,
): RegionResult {
  if (lines.length === 0) {
    return { regions: [], columnCount: 1, confidence: 1 };
  }

  const fontSize = median(lines.map((l) => l.fontSize)) || 10;
  const colGap = minColumnGap ?? Math.max(fontSize * 1.6, pageWidth * 0.035);
  const rowGap = Math.max(fontSize * 1.35, 6);

  let maxFanout = 1;
  let confidence = 1;

  const cut = (input: TextLine[], depth: number): Region[] => {
    if (input.length <= 1 || depth >= MAX_DEPTH) {
      return [{ bbox: unionBBox(input.map((l) => l.bbox)), lines: input }];
    }
    const bounds = unionBBox(input.map((l) => l.bbox));

    const vGaps = findGaps(
      input.map((l) => [l.bbox.x, right(l.bbox)] as const),
      bounds.x,
      right(bounds),
    ).filter((g) => g.size >= colGap);

    if (vGaps.length > 0) {
      const widest = vGaps.reduce((a, b) => (b.size > a.size ? b : a));
      const split = (widest.start + widest.end) / 2;
      const leftLines = input.filter((l) => l.bbox.x + l.bbox.width / 2 < split);
      const rightLines = input.filter((l) => l.bbox.x + l.bbox.width / 2 >= split);
      if (leftLines.length > 0 && rightLines.length > 0) {
        maxFanout = Math.max(maxFanout, 2);
        confidence = Math.min(confidence, clamp(widest.size / (colGap * 1.8), 0.5, 1));
        return [...cut(leftLines, depth + 1), ...cut(rightLines, depth + 1)];
      }
    }

    const hGaps = findGaps(
      input.map((l) => [l.bbox.y, bottom(l.bbox)] as const),
      bounds.y,
      bottom(bounds),
    ).filter((g) => g.size >= rowGap);

    if (hGaps.length > 0) {
      const widest = hGaps.reduce((a, b) => (b.size > a.size ? b : a));
      const split = (widest.start + widest.end) / 2;
      const top = input.filter((l) => l.baseline < split);
      const rest = input.filter((l) => l.baseline >= split);
      if (top.length > 0 && rest.length > 0) {
        return [...cut(top, depth + 1), ...cut(rest, depth + 1)];
      }
    }

    return [{ bbox: bounds, lines: input }];
  };

  const regions = cut([...lines], 0).filter((r) => r.lines.length > 0);
  for (const region of regions) {
    region.lines.sort((a, b) => a.baseline - b.baseline || a.bbox.x - b.bbox.x);
  }

  const columnCount = countColumns(regions, pageWidth, colGap);
  if (columnCount > 3) confidence = Math.min(confidence, 0.5);

  return { regions, columnCount, confidence: clamp(confidence, 0, 1) };
}

/** 用区域的横向投影估计栏数：互不重叠的横向簇即为栏 */
function countColumns(regions: readonly Region[], pageWidth: number, colGap: number): number {
  const wide = regions.filter((r) => r.bbox.width > pageWidth * 0.55);
  if (wide.length > 0 && regions.length <= wide.length + 1) return 1;

  const intervals = regions
    .filter((r) => r.lines.length >= 2)
    .map((r) => [r.bbox.x, right(r.bbox)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (intervals.length === 0) return 1;

  let count = 1;
  let reach = intervals[0][1];
  for (const [s, e] of intervals.slice(1)) {
    if (s - reach >= colGap) count++;
    reach = Math.max(reach, e);
  }
  return count;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
