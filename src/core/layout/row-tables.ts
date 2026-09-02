import type { PrimitiveSegment, PrimitiveTextSpan } from '../contracts/primitives.ts';
import type { TableBlock, TableCell, TextLine } from '../contracts/layout.ts';
import { makeBBox, unionBBox } from '../geometry/bbox.ts';
import { cluster1D, median } from '../geometry/stats.ts';
import { buildLines } from './lines.ts';
import { mergeRules } from './tables.ts';
import type { Rule } from './tables.ts';

/**
 * 只有横线的表格：券商研报的三线表、对账单、财务报表几乎都是这种。
 * 没有竖线，列结构只能靠文字对齐推断，所以判定比有框线表格保守得多：
 * 至少两条等宽横线、至少两行、至少两列、大多数行的单元格都能落进同一套列里。
 */

/** 横线至少多长才可能是表格线（pt） */
const MIN_RULE_LENGTH = 60;
/** 相邻横线间距在这以内，直接当同一张表 */
const MAX_ROW_GAP = 120;
/**
 * 三线表的表体可以很高（表头线到底线之间几十行没有线）。这么远的两条线也允许配对，
 * 但只有两条线时要求列结构非常明确，避免把页眉线和页脚线之间的双栏正文当成表。
 */
const MAX_LONG_GAP = 520;
/** 表头行可以在第一条横线上方多远（pt） */
const HEADER_REACH = 26;
/** 同一行里，span 之间的空隙超过字号的这个倍数就切成两个单元格 */
const CELL_GAP_EM = 1.3;
const MIN_CELL_GAP = 7;
/** 列对齐：左边或右边相差不超过这个值就算同一列 */
const ALIGN_TOLERANCE = 4;

interface RuleStack {
  readonly rules: Rule[];
  readonly x0: number;
  readonly x1: number;
  /** 有过一次超过 MAX_ROW_GAP 的配对，验收要更严 */
  readonly longGap: boolean;
}

interface CellRun {
  readonly lines: TextLine[];
  x0: number;
  x1: number;
}

/** 把等宽、间距不大的横线按上下顺序串成一叠 */
function stackRules(rules: readonly Rule[]): RuleStack[] {
  const sorted = [...rules]
    .filter((r) => r.end - r.start >= MIN_RULE_LENGTH)
    .sort((a, b) => a.position - b.position);
  const stacks: RuleStack[] = [];
  let current: { rules: Rule[]; x0: number; x1: number; longGap: boolean } | null = null;

  for (const rule of sorted) {
    if (current !== null) {
      const last = current.rules[current.rules.length - 1];
      const overlap = Math.min(current.x1, rule.end) - Math.max(current.x0, rule.start);
      const shorter = Math.min(current.x1 - current.x0, rule.end - rule.start);
      const aligned = overlap >= shorter * 0.8;
      const gap = rule.position - last.position;
      if (aligned && gap <= MAX_LONG_GAP) {
        current.rules.push(rule);
        current.x0 = Math.min(current.x0, rule.start);
        current.x1 = Math.max(current.x1, rule.end);
        if (gap > MAX_ROW_GAP) current.longGap = true;
        continue;
      }
      stacks.push(current);
    }
    current = { rules: [rule], x0: rule.start, x1: rule.end, longGap: false };
  }
  if (current !== null) stacks.push(current);
  return stacks.filter((s) => s.rules.length >= 2);
}

/** 一行文字按横向空隙切成若干单元格 */
function splitLineIntoRuns(line: TextLine): CellRun[] {
  const spans = [...line.spans].sort((a, b) => a.bbox.x - b.bbox.x);
  const runs: { spans: PrimitiveTextSpan[]; x0: number; x1: number }[] = [];
  for (const span of spans) {
    const last = runs[runs.length - 1];
    const gapLimit = Math.max(MIN_CELL_GAP, span.fontSize * CELL_GAP_EM);
    if (last !== undefined && span.bbox.x - last.x1 <= gapLimit) {
      last.spans.push(span);
      last.x1 = Math.max(last.x1, span.bbox.x + span.bbox.width);
    } else {
      runs.push({ spans: [span], x0: span.bbox.x, x1: span.bbox.x + span.bbox.width });
    }
  }
  return runs.map((r) => ({ lines: buildLines(r.spans).lines, x0: r.x0, x1: r.x1 }));
}

/** 同一行带里多行文字的单元格按 x 重叠合并（换行的长名称） */
function mergeRunsVertically(runs: readonly CellRun[]): CellRun[] {
  const merged: CellRun[] = [];
  for (const run of runs) {
    const hit = merged.find((m) => {
      const overlap = Math.min(m.x1, run.x1) - Math.max(m.x0, run.x0);
      return overlap > Math.min(m.x1 - m.x0, run.x1 - run.x0) * 0.3;
    });
    if (hit === undefined) {
      merged.push({ lines: [...run.lines], x0: run.x0, x1: run.x1 });
    } else {
      hit.lines.push(...run.lines);
      hit.x0 = Math.min(hit.x0, run.x0);
      hit.x1 = Math.max(hit.x1, run.x1);
    }
  }
  return merged;
}

function sameColumn(a: { x0: number; x1: number }, b: { x0: number; x1: number }): boolean {
  if (Math.abs(a.x0 - b.x0) <= ALIGN_TOLERANCE || Math.abs(a.x1 - b.x1) <= ALIGN_TOLERANCE)
    return true;
  const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  return overlap > Math.min(a.x1 - a.x0, b.x1 - b.x0) * 0.4;
}

export function detectRowRuledTables(
  segments: readonly PrimitiveSegment[],
  spans: readonly PrimitiveTextSpan[],
  pageIndex: number,
  nextOrder: () => number,
  consumed: Set<string>,
): TableBlock[] {
  const rules = mergeRules(segments.filter((s) => s.orientation === 'horizontal'));
  const stacks = stackRules(rules);
  if (stacks.length === 0) return [];
  const free = spans.filter((s) => !consumed.has(s.id));
  const tables: TableBlock[] = [];

  for (const stack of stacks) {
    const table = buildRowTable(stack, free, pageIndex, nextOrder, consumed);
    if (table !== null) tables.push(table);
  }
  return tables;
}

function buildRowTable(
  stack: RuleStack,
  spans: readonly PrimitiveTextSpan[],
  pageIndex: number,
  nextOrder: () => number,
  consumed: Set<string>,
): TableBlock | null {
  const positions = stack.rules.map((r) => r.position);
  const top = positions[0];
  const bottom = positions[positions.length - 1];
  const inX = (s: PrimitiveTextSpan): boolean => {
    const cx = s.bbox.x + s.bbox.width / 2;
    return cx >= stack.x0 - 2 && cx <= stack.x1 + 2;
  };
  const centerY = (s: PrimitiveTextSpan): number => s.bbox.y + s.bbox.height / 2;

  // 行带：相邻横线之间各一带；第一条线上方贴着的一行当表头带
  const bands: { y0: number; y1: number }[] = [];
  const above = spans.filter((s) => inX(s) && centerY(s) < top && centerY(s) >= top - HEADER_REACH);
  if (above.length > 0) bands.push({ y0: top - HEADER_REACH, y1: top });
  for (let i = 0; i + 1 < positions.length; i++)
    bands.push({ y0: positions[i], y1: positions[i + 1] });

  // 每个行带 → 若干行（多行文字且每行都有多个单元格时按行拆，否则整带一行）
  const rows: CellRun[][] = [];
  for (const band of bands) {
    const inside = spans.filter((s) => inX(s) && centerY(s) > band.y0 && centerY(s) < band.y1);
    if (inside.length === 0) continue;
    // buildLines 会把同一基线上隔得远的文字拆成多条"行"，这里先按基线归回一行
    const lines = buildLines(inside).lines;
    const fontSize = median(lines.map((l) => l.fontSize)) || 9;
    const baselineRows = cluster1D(
      lines.map((l) => l.baseline),
      fontSize * 0.5,
    ).map((c) => c.indices.flatMap((i) => splitLineIntoRuns(lines[i])));
    const multiCell = baselineRows.filter((runs) => runs.length >= 2).length;
    if (baselineRows.length > 1 && multiCell >= baselineRows.length * 0.6) {
      for (const runs of baselineRows) rows.push(mergeRunsVertically(runs));
    } else {
      rows.push(mergeRunsVertically(baselineRows.flat()));
    }
  }
  if (rows.length < 2) return null;
  const multiCellRows = rows.filter((r) => r.length >= 2).length;
  if (multiCellRows < rows.length * 0.6) return null;
  if (bottom - top < 10) return null;

  // 列：所有单元格按对齐/重叠聚类
  const allRuns = rows.flat();
  const columns: { x0: number; x1: number; members: number }[] = [];
  const runColumn = new Map<CellRun, number>();
  for (const run of allRuns) {
    let index = columns.findIndex((c) => sameColumn(c, run));
    if (index === -1) {
      columns.push({ x0: run.x0, x1: run.x1, members: 0 });
      index = columns.length - 1;
    } else {
      columns[index].x0 = Math.min(columns[index].x0, run.x0);
      columns[index].x1 = Math.max(columns[index].x1, run.x1);
    }
    columns[index].members++;
    runColumn.set(run, index);
  }
  if (columns.length < 2 || columns.length > 30) return null;

  // 只有两条线且隔得远：必须至少三列、每行都有多个单元格、单元格都窄，否则宁可不认
  if (stack.longGap && stack.rules.length < 3) {
    const width = stack.x1 - stack.x0;
    const cellWidths = allRuns.map((r) => r.x1 - r.x0);
    const strict =
      columns.length >= 3 &&
      rows.length >= 3 &&
      multiCellRows === rows.length &&
      median(cellWidths) <= width * 0.3;
    if (!strict) return null;
  }

  // 按 x 排序并重编号；同一行两个单元格落进同一列说明列结构不成立
  const order = columns
    .map((c, i) => ({ i, cx: (c.x0 + c.x1) / 2 }))
    .sort((a, b) => a.cx - b.cx)
    .map((o) => o.i);
  const rank = new Map(order.map((original, position) => [original, position]));
  let conflicts = 0;
  for (const row of rows) {
    const seen = new Set<number>();
    for (const run of row) {
      const col = rank.get(runColumn.get(run) ?? -1) ?? -1;
      if (seen.has(col)) conflicts++;
      seen.add(col);
    }
  }
  if (conflicts > rows.length * 0.1) return null;

  const nCols = columns.length;
  const sortedCols = order.map((i) => columns[i]);
  const boundaries: number[] = [stack.x0];
  for (let i = 0; i + 1 < sortedCols.length; i++) {
    boundaries.push((sortedCols[i].x1 + sortedCols[i + 1].x0) / 2);
  }
  boundaries.push(stack.x1);

  const cells: TableCell[] = [];
  const cellSeen = new Set<string>();
  rows.forEach((row, r) => {
    for (const run of row) {
      const col = rank.get(runColumn.get(run) ?? -1);
      if (col === undefined) continue;
      const key = `${r}:${col}`;
      if (cellSeen.has(key)) continue;
      cellSeen.add(key);
      const bbox = unionBBox(run.lines.map((l) => l.bbox));
      cells.push({
        row: r,
        col,
        rowSpan: 1,
        colSpan: 1,
        bbox: makeBBox(boundaries[col], bbox.y, boundaries[col + 1], bbox.y + bbox.height),
        lines: run.lines,
      });
    }
  });

  const consistent = rows.filter((row) => row.length === nCols).length;
  const confidence = Math.min(0.9, 0.5 + (0.4 * consistent) / rows.length);
  const firstRowTop = Math.min(...cells.map((c) => c.bbox.y));
  const bbox = makeBBox(stack.x0, Math.min(firstRowTop, top), stack.x1, bottom);
  if (bbox.width < 40) return null;

  for (const cell of cells)
    for (const line of cell.lines) for (const id of line.spanIds) consumed.add(id);

  const widths = Array.from({ length: nCols }, (_, i) => boundaries[i + 1] - boundaries[i]);
  return {
    kind: 'table',
    meta: {
      pageIndex,
      bbox,
      readingOrder: nextOrder(),
      confidence,
      sourceElementIds: cells.flatMap((c) => c.lines.flatMap((l) => l.spanIds)),
    },
    rows: rows.length,
    cols: nCols,
    columnWidths: widths,
    cells,
    bordered: false,
  };
}
