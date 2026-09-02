/**
 * 在渲染位图上找表格框线。扫描件没有矢量线段，框线只存在于像素里，
 * 不找出来的话扫描的报名表、课程表、三线表就全变成一行行散落的文字。
 *
 * 做法：二值化后，横向只保留连续够长的墨迹（文字笔画都很短），再把剩下的像素按连通关系聚成段，
 * 又长又扁的就是横线；竖线同理。扫描歪了半度的线会斜跨几行像素，但仍然连续，还是一个分量。
 * 结果以 PrimitiveSegment 交给现有的表格识别，和矢量线段走同一条路。
 */
import type { PrimitiveSegment } from '../contracts/primitives.ts';

/** 横向 / 纵向连续墨迹至少这么长（pt）才可能是线的一部分：汉字笔画远短于此 */
const MIN_RUN_PT = 20;
/** 一条框线至少多长（pt） */
const MIN_RULE_PT = 30;
/** 框线最厚多少（pt）：更粗的是色块、大字笔画 */
const MAX_THICKNESS_PT = 3;
/** 倾斜容差：线的另一维尺寸不超过长度的这个比例（约 1.7°）加上厚度 */
const SKEW_RATIO = 0.03;
/** 贴着画布边缘这个比例以内的线是扫描仪的黑边，不要 */
const EDGE_RATIO = 0.01;
/** 允许跨过的小缺口（像素）：JPEG 压缩会把线咬出小洞 */
const MAX_GAP_PX = 2;
/** 暗到这个程度算墨迹（r+g+b） */
const INK_THRESHOLD = 450;

export interface Bitmap {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

interface Run {
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

interface Component {
  minLine: number;
  maxLine: number;
  minPos: number;
  maxPos: number;
}

function inkMask(bitmap: Bitmap): Uint8Array {
  const { data, width, height } = bitmap;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    // 红章、红头的线也算墨迹：单独一条线不会成表，多算无害
    if (r + g + b < INK_THRESHOLD || (r > 110 && r - g > 50 && r - b > 50)) mask[i] = 1;
  }
  return mask;
}

/**
 * 沿一个方向找足够长的墨迹跑：lines 是扫描的行（横线时是 y），span 是沿线方向的长度。
 * at(line, pos) 取像素。
 */
function longRuns(
  lines: number,
  length: number,
  minRun: number,
  at: (line: number, pos: number) => number,
): Run[] {
  const runs: Run[] = [];
  for (let line = 0; line < lines; line++) {
    let start = -1;
    let gap = 0;
    for (let pos = 0; pos <= length; pos++) {
      const ink = pos < length && at(line, pos) === 1;
      if (ink) {
        if (start < 0) start = pos;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap > MAX_GAP_PX || pos === length) {
          const end = pos - gap;
          if (end - start >= minRun) runs.push({ line, start, end });
          start = -1;
          gap = 0;
        }
      }
    }
  }
  return runs;
}

/** 相邻扫描行上重叠的跑连成分量（并查集） */
function connect(runs: readonly Run[]): Component[] {
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const byLine = new Map<number, number[]>();
  runs.forEach((run, i) => {
    const list = byLine.get(run.line);
    if (list) list.push(i);
    else byLine.set(run.line, [i]);
  });
  runs.forEach((run, i) => {
    for (const j of byLine.get(run.line - 1) ?? []) {
      const other = runs[j];
      if (other.start <= run.end + 1 && run.start <= other.end + 1) parent[find(j)] = find(i);
    }
  });
  const groups = new Map<number, Component>();
  runs.forEach((run, i) => {
    const root = find(i);
    const c = groups.get(root);
    if (c) {
      c.minLine = Math.min(c.minLine, run.line);
      c.maxLine = Math.max(c.maxLine, run.line);
      c.minPos = Math.min(c.minPos, run.start);
      c.maxPos = Math.max(c.maxPos, run.end);
    } else {
      groups.set(root, {
        minLine: run.line,
        maxLine: run.line,
        minPos: run.start,
        maxPos: run.end,
      });
    }
  });
  return [...groups.values()];
}

/** 从位图里找框线；坐标换算回页面 pt */
export function detectRasterRules(
  bitmap: Bitmap,
  scale: number,
  pageIndex: number,
): PrimitiveSegment[] {
  const { width, height } = bitmap;
  if (width < 4 || height < 4 || scale <= 0) return [];
  const mask = inkMask(bitmap);
  const minRun = Math.round(MIN_RUN_PT * scale);
  const minRule = MIN_RULE_PT * scale;
  const maxThickness = MAX_THICKNESS_PT * scale;
  const edgeX = width * EDGE_RATIO;
  const edgeY = height * EDGE_RATIO;
  const segments: PrimitiveSegment[] = [];

  const horizontal = connect(longRuns(height, width, minRun, (y, x) => mask[y * width + x]));
  for (const c of horizontal) {
    const length = c.maxPos - c.minPos;
    const thickness = c.maxLine - c.minLine + 1;
    if (length < minRule || thickness > maxThickness + length * SKEW_RATIO) continue;
    if (c.minLine < edgeY || c.maxLine > height - edgeY) continue;
    if (c.minPos < edgeX && c.maxPos > width - edgeX) continue;
    segments.push({
      id: `p${pageIndex}-rh${segments.length}`,
      pageIndex,
      orientation: 'horizontal',
      start: c.minPos / scale,
      end: c.maxPos / scale,
      position: (c.minLine + c.maxLine + 1) / 2 / scale,
      thickness: Math.min(thickness, maxThickness) / scale,
      source: 'raster',
    });
  }

  const vertical = connect(longRuns(width, height, minRun, (x, y) => mask[y * width + x]));
  for (const c of vertical) {
    const length = c.maxPos - c.minPos;
    const thickness = c.maxLine - c.minLine + 1;
    if (length < minRule || thickness > maxThickness + length * SKEW_RATIO) continue;
    if (c.minLine < edgeX || c.maxLine > width - edgeX) continue;
    if (c.minPos < edgeY && c.maxPos > height - edgeY) continue;
    segments.push({
      id: `p${pageIndex}-rv${segments.length}`,
      pageIndex,
      orientation: 'vertical',
      start: c.minPos / scale,
      end: c.maxPos / scale,
      position: (c.minLine + c.maxLine + 1) / 2 / scale,
      thickness: Math.min(thickness, maxThickness) / scale,
      source: 'raster',
    });
  }
  return segments;
}

/** 从渲染好的画布上找框线 */
export function detectRulesOnCanvas(
  canvas: OffscreenCanvas,
  scale: number,
  pageIndex: number,
): PrimitiveSegment[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null || canvas.width === 0 || canvas.height === 0) return [];
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return detectRasterRules(
    { data: image.data, width: image.width, height: image.height },
    scale,
    pageIndex,
  );
}
