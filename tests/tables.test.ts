import { describe, expect, it } from 'vitest';
import { detectTables } from '../src/core/layout/tables.ts';
import { hRule, span, vRule } from './helpers.ts';

/** 2 行 × 2 列的完整网格：x = 100/200/300，y = 100/130/160 */
function grid2x2() {
  return [
    hRule(100, 100, 300),
    hRule(130, 100, 300),
    hRule(160, 100, 300),
    vRule(100, 100, 160),
    vRule(200, 100, 160),
    vRule(300, 100, 160),
  ];
}

function cellSpan(text: string, x: number, y: number) {
  return span({ text, x, baseline: y, fontSize: 10, width: 40 });
}

describe('detectTables', () => {
  it('从框线还原出 2×2 网格并把文字放进对应单元格', () => {
    let order = 0;
    const spans = [
      cellSpan('A1', 110, 120),
      cellSpan('B1', 210, 120),
      cellSpan('A2', 110, 150),
      cellSpan('B2', 210, 150),
    ];
    const { tables, consumedSpanIds } = detectTables(grid2x2(), spans, 0, () => order++);

    expect(tables).toHaveLength(1);
    const table = tables[0];
    expect(table.rows).toBe(2);
    expect(table.cols).toBe(2);
    expect(table.cells).toHaveLength(4);
    expect(consumedSpanIds.size).toBe(4);

    const a1 = table.cells.find((c) => c.row === 0 && c.col === 0);
    const b2 = table.cells.find((c) => c.row === 1 && c.col === 1);
    expect(a1?.lines[0].text).toBe('A1');
    expect(b2?.lines[0].text).toBe('B2');
  });

  it('缺少中间竖线时识别为横向合并单元格', () => {
    let order = 0;
    // 第一行没有 x=200 的竖线 → A1 与 B1 合并成一个跨两列的单元格
    const segments = [
      hRule(100, 100, 300),
      hRule(130, 100, 300),
      hRule(160, 100, 300),
      vRule(100, 100, 160),
      vRule(200, 130, 160),
      vRule(300, 100, 160),
    ];
    const spans = [
      cellSpan('合并表头', 110, 120),
      cellSpan('A2', 110, 150),
      cellSpan('B2', 210, 150),
    ];
    const { tables } = detectTables(segments, spans, 0, () => order++);

    expect(tables).toHaveLength(1);
    const merged = tables[0].cells.find((c) => c.row === 0 && c.col === 0);
    expect(merged?.colSpan).toBe(2);
    expect(merged?.lines[0].text).toBe('合并表头');
  });

  it('缺少中间横线时识别为纵向合并单元格', () => {
    let order = 0;
    const segments = [
      hRule(100, 100, 300),
      hRule(130, 200, 300),
      hRule(160, 100, 300),
      vRule(100, 100, 160),
      vRule(200, 100, 160),
      vRule(300, 100, 160),
    ];
    const { tables } = detectTables(segments, [cellSpan('跨行', 110, 130)], 0, () => order++);
    const cell = tables[0].cells.find((c) => c.row === 0 && c.col === 0);
    expect(cell?.rowSpan).toBe(2);
  });

  it('只有孤立线段时不产出表格', () => {
    let order = 0;
    const { tables } = detectTables(
      [hRule(100, 100, 300), hRule(200, 100, 300)],
      [cellSpan('文字', 110, 150)],
      0,
      () => order++,
    );
    expect(tables).toHaveLength(0);
  });

  it('网格里没有任何文字时丢弃，避免把装饰线框当表格', () => {
    let order = 0;
    const { tables, consumedSpanIds } = detectTables(grid2x2(), [], 0, () => order++);
    expect(tables).toHaveLength(0);
    expect(consumedSpanIds.size).toBe(0);
  });

  it('框线完整度反映在置信度上', () => {
    let order = 0;
    const { tables } = detectTables(grid2x2(), [cellSpan('A1', 110, 120)], 0, () => order++);
    expect(tables[0].meta.confidence).toBeGreaterThan(0.9);
  });
});
