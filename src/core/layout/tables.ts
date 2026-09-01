import type { BBox } from '../contracts/geometry.ts';
import type { PrimitiveSegment, PrimitiveTextSpan } from '../contracts/primitives.ts';
import type { TableBlock, TableCell, TextLine } from '../contracts/layout.ts';
import { makeBBox } from '../geometry/bbox.ts';
import { cluster1D } from '../geometry/stats.ts';
import { buildLines } from './lines.ts';

/** 同一条框线的位置容差（pt） */
const RULE_TOLERANCE = 2.5;
/** 判断线段是否覆盖某区间时允许的缺口（pt） */
const COVER_TOLERANCE = 3;
/** 单元格内文字判定的内缩（pt），避免贴边文字被判到隔壁 */
const CELL_INSET = 1;

interface Rule {
  readonly position: number;
  readonly start: number;
  readonly end: number;
}

export interface TableDetectionResult {
  readonly tables: TableBlock[];
  readonly consumedSpanIds: ReadonlySet<string>;
}

/** 把同一位置的线段合并成尽量少的连续区间 */
function mergeRules(segments: readonly PrimitiveSegment[]): Rule[] {
  if (segments.length === 0) return [];
  const clusters = cluster1D(
    segments.map((s) => s.position),
    RULE_TOLERANCE,
  );
  const rules: Rule[] = [];
  for (const cluster of clusters) {
    const members = cluster.indices
      .map((i) => segments[i])
      .sort((a, b) => a.start - b.start);
    let start = members[0].start;
    let end = members[0].end;
    for (const m of members.slice(1)) {
      if (m.start <= end + COVER_TOLERANCE) {
        end = Math.max(end, m.end);
      } else {
        rules.push({ position: cluster.value, start, end });
        start = m.start;
        end = m.end;
      }
    }
    rules.push({ position: cluster.value, start, end });
  }
  return rules;
}

function covers(rule: Rule, from: number, to: number): boolean {
  return rule.start <= from + COVER_TOLERANCE && rule.end >= to - COVER_TOLERANCE;
}

function hasRuleAt(rules: readonly Rule[], position: number, from: number, to: number): boolean {
  return rules.some((r) => Math.abs(r.position - position) <= RULE_TOLERANCE && covers(r, from, to));
}

function intersects(h: Rule, v: Rule): boolean {
  return (
    h.start - COVER_TOLERANCE <= v.position &&
    h.end + COVER_TOLERANCE >= v.position &&
    v.start - COVER_TOLERANCE <= h.position &&
    v.end + COVER_TOLERANCE >= h.position
  );
}

class UnionFind {
  #parent: number[];
  constructor(size: number) {
    this.#parent = Array.from({ length: size }, (_, i) => i);
  }
  find(a: number): number {
    while (this.#parent[a] !== a) {
      this.#parent[a] = this.#parent[this.#parent[a]];
      a = this.#parent[a];
    }
    return a;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.#parent[rb] = ra;
  }
}

/**
 * 有框线表格识别：先把矢量线段合并成横竖框线，再按相交关系做连通分量，
 * 每个同时含 ≥2 横线和 ≥2 竖线的分量视为一张表。
 * 无框线表格误判代价高，默认不做；需要时由上层单独开启。
 */
export function detectTables(
  segments: readonly PrimitiveSegment[],
  spans: readonly PrimitiveTextSpan[],
  pageIndex: number,
  nextOrder: () => number,
): TableDetectionResult {
  const hRules = mergeRules(segments.filter((s) => s.orientation === 'horizontal'));
  const vRules = mergeRules(segments.filter((s) => s.orientation === 'vertical'));
  const consumed = new Set<string>();
  if (hRules.length < 2 || vRules.length < 2) return { tables: [], consumedSpanIds: consumed };

  const total = hRules.length + vRules.length;
  const uf = new UnionFind(total);
  for (let i = 0; i < hRules.length; i++) {
    for (let j = 0; j < vRules.length; j++) {
      if (intersects(hRules[i], vRules[j])) uf.union(i, hRules.length + j);
    }
  }

  const components = new Map<number, { h: Rule[]; v: Rule[] }>();
  for (let i = 0; i < total; i++) {
    const root = uf.find(i);
    let entry = components.get(root);
    if (!entry) {
      entry = { h: [], v: [] };
      components.set(root, entry);
    }
    if (i < hRules.length) entry.h.push(hRules[i]);
    else entry.v.push(vRules[i - hRules.length]);
  }

  const tables: TableBlock[] = [];
  for (const { h, v } of components.values()) {
    if (h.length < 2 || v.length < 2) continue;
    const table = buildTable(h, v, spans, pageIndex, nextOrder, consumed);
    if (table !== null) tables.push(table);
  }
  tables.sort((a, b) => a.meta.bbox.y - b.meta.bbox.y);
  return { tables, consumedSpanIds: consumed };
}

function buildTable(
  hRules: readonly Rule[],
  vRules: readonly Rule[],
  spans: readonly PrimitiveTextSpan[],
  pageIndex: number,
  nextOrder: () => number,
  consumed: Set<string>,
): TableBlock | null {
  const rowLines = cluster1D(hRules.map((r) => r.position), RULE_TOLERANCE)
    .map((c) => c.value)
    .sort((a, b) => a - b);
  const colLines = cluster1D(vRules.map((r) => r.position), RULE_TOLERANCE)
    .map((c) => c.value)
    .sort((a, b) => a - b);
  if (rowLines.length < 2 || colLines.length < 2) return null;

  const nRows = rowLines.length - 1;
  const nCols = colLines.length - 1;
  if (nRows < 1 || nCols < 1) return null;
  if (nRows * nCols > 4000) return null; // 明显不是表格，多半是图表网格

  const bbox = makeBBox(colLines[0], rowLines[0], colLines[nCols], rowLines[nRows]);
  if (bbox.width < 20 || bbox.height < 12) return null;

  const occupied: boolean[][] = Array.from({ length: nRows }, () => new Array<boolean>(nCols).fill(false));
  const cells: TableCell[] = [];
  let borderedEdges = 0;
  let totalEdges = 0;

  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      if (occupied[r][c]) continue;

      let colSpan = 1;
      while (
        c + colSpan < nCols &&
        !hasRuleAt(vRules, colLines[c + colSpan], rowLines[r], rowLines[r + 1])
      ) {
        colSpan++;
      }
      let rowSpan = 1;
      while (
        r + rowSpan < nRows &&
        !hasRuleAt(hRules, rowLines[r + rowSpan], colLines[c], colLines[c + colSpan])
      ) {
        rowSpan++;
      }

      for (let rr = r; rr < r + rowSpan; rr++) {
        for (let cc = c; cc < c + colSpan; cc++) occupied[rr][cc] = true;
      }

      const cellBox = makeBBox(
        colLines[c],
        rowLines[r],
        colLines[c + colSpan],
        rowLines[r + rowSpan],
      );
      totalEdges += 4;
      if (hasRuleAt(hRules, rowLines[r], colLines[c], colLines[c + colSpan])) borderedEdges++;
      if (hasRuleAt(hRules, rowLines[r + rowSpan], colLines[c], colLines[c + colSpan])) borderedEdges++;
      if (hasRuleAt(vRules, colLines[c], rowLines[r], rowLines[r + rowSpan])) borderedEdges++;
      if (hasRuleAt(vRules, colLines[c + colSpan], rowLines[r], rowLines[r + rowSpan])) borderedEdges++;

      cells.push({
        row: r,
        col: c,
        rowSpan,
        colSpan,
        bbox: cellBox,
        lines: collectCellLines(spans, cellBox, consumed),
      });
    }
  }

  const hasText = cells.some((cell) => cell.lines.length > 0);
  if (!hasText) {
    for (const cell of cells) for (const line of cell.lines) for (const id of line.spanIds) consumed.delete(id);
    return null;
  }

  const confidence = totalEdges === 0 ? 0 : borderedEdges / totalEdges;
  const columnWidths = Array.from({ length: nCols }, (_, i) => colLines[i + 1] - colLines[i]);

  return {
    kind: 'table',
    meta: {
      pageIndex,
      bbox,
      readingOrder: nextOrder(),
      confidence,
      sourceElementIds: cells.flatMap((c) => c.lines.flatMap((l) => l.spanIds)),
    },
    rows: nRows,
    cols: nCols,
    columnWidths,
    cells,
    bordered: true,
  };
}

function collectCellLines(
  spans: readonly PrimitiveTextSpan[],
  cell: BBox,
  consumed: Set<string>,
): TextLine[] {
  const inside = spans.filter((s) => {
    const cx = s.bbox.x + s.bbox.width / 2;
    const cy = s.bbox.y + s.bbox.height / 2;
    return (
      cx >= cell.x - CELL_INSET &&
      cx <= cell.x + cell.width + CELL_INSET &&
      cy >= cell.y - CELL_INSET &&
      cy <= cell.y + cell.height + CELL_INSET
    );
  });
  if (inside.length === 0) return [];
  for (const s of inside) consumed.add(s.id);
  return buildLines(inside).lines;
}
