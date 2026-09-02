import { describe, expect, it } from 'vitest';
import { detectRowRuledTables } from '../src/core/layout/row-tables.ts';
import { hRule, line, span } from './helpers.ts';

const order = () => {
  let n = 0;
  return () => n++;
};

describe('detectRowRuledTables', () => {
  it('三线表：表头在第一条线上方，正文多行按行拆，三列对齐', () => {
    const segments = [hRule(100, 72, 400), hRule(118, 72, 400), hRule(170, 72, 400)];
    const spans = [
      // 表头（线上方）
      span({ text: '代码', x: 72, baseline: 95, width: 30 }),
      span({ text: '数量', x: 220, baseline: 95, width: 30 }),
      span({ text: '市值', x: 340, baseline: 95, width: 30 }),
      // 正文三行，数字右对齐
      span({ text: 'HWM', x: 72, baseline: 132, width: 40 }),
      span({ text: '269', x: 234, baseline: 132, width: 16 }),
      span({ text: '70,265.49', x: 330, baseline: 132, width: 50 }),
      span({ text: 'IHI', x: 72, baseline: 148, width: 24 }),
      span({ text: '1,184', x: 224, baseline: 148, width: 26 }),
      span({ text: '59,839.36', x: 330, baseline: 148, width: 50 }),
      span({ text: 'LMT', x: 72, baseline: 164, width: 30 }),
      span({ text: '72', x: 240, baseline: 164, width: 10 }),
      span({ text: '37,626.48', x: 330, baseline: 164, width: 50 }),
      // 表外的正文，不该被吃进去
      span({ text: '备注：以上数据仅供参考', x: 72, baseline: 220, width: 150 }),
    ];
    const consumed = new Set<string>();
    const tables = detectRowRuledTables(segments, spans, 0, order(), consumed);
    expect(tables).toHaveLength(1);
    const t = tables[0];
    expect(t.cols).toBe(3);
    expect(t.rows).toBe(4);
    expect(t.bordered).toBe(false);
    const cellText = (r: number, c: number) =>
      t.cells
        .find((x) => x.row === r && x.col === c)
        ?.lines.map((l) => l.text)
        .join('');
    expect(cellText(0, 0)).toBe('代码');
    expect(cellText(1, 2)).toBe('70,265.49');
    expect(cellText(3, 1)).toBe('72');
    expect(consumed.size).toBe(12);
    expect(t.meta.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('对账单：每行之间都有横线，换行的长名称合并成一个单元格', () => {
    const segments = [hRule(100, 72, 400), hRule(130, 72, 400), hRule(160, 72, 400)];
    const spans = [
      span({ text: 'SPG(INVESCO EXCHANGE TRADED', x: 72, baseline: 112, width: 140 }),
      span({ text: 'ETF)', x: 72, baseline: 124, width: 24 }),
      span({ text: '2,804', x: 250, baseline: 112, width: 26 }),
      span({ text: '329,554.12', x: 330, baseline: 112, width: 55 }),
      span({ text: 'TDG', x: 72, baseline: 148, width: 24 }),
      span({ text: '23', x: 258, baseline: 148, width: 10 }),
      span({ text: '27,556.07', x: 335, baseline: 148, width: 50 }),
    ];
    const tables = detectRowRuledTables(segments, spans, 0, order(), new Set());
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toBe(2);
    expect(tables[0].cols).toBe(3);
    const first = tables[0].cells.find((c) => c.row === 0 && c.col === 0);
    expect(first?.lines).toHaveLength(2);
  });

  it('两条线之间只是一段普通文字，不认成表', () => {
    const segments = [hRule(100, 72, 500), hRule(200, 72, 500)];
    const spans = [
      line('这是一段被两条分隔线夹着的普通正文，它没有列结构。', 72, 120, 400),
      line('第二行仍然是普通正文，宽度铺满整行。', 72, 136, 380),
      line('第三行。', 72, 152, 60),
    ];
    expect(detectRowRuledTables(segments, spans, 0, order(), new Set())).toHaveLength(0);
  });

  it('已经被有框线表格用掉的文字不再参与', () => {
    const segments = [hRule(100, 72, 400), hRule(120, 72, 400), hRule(140, 72, 400)];
    const spans = [
      span({ text: 'a', x: 72, baseline: 112, width: 10 }),
      span({ text: 'b', x: 200, baseline: 112, width: 10 }),
      span({ text: 'c', x: 72, baseline: 132, width: 10 }),
      span({ text: 'd', x: 200, baseline: 132, width: 10 }),
    ];
    const consumed = new Set(spans.map((s) => s.id));
    expect(detectRowRuledTables(segments, spans, 0, order(), consumed)).toHaveLength(0);
  });
});

describe('detectRowRuledTables · 只有两条线但隔得远', () => {
  const order = () => {
    let n = 0;
    return () => n++;
  };

  it('三列以上、每行都分格、单元格都窄的持仓表能认出来', () => {
    const segments = [hRule(91, 53, 789), hRule(439, 53, 789)];
    const spans: ReturnType<typeof span>[] = [];
    for (let r = 0; r < 12; r++) {
      const y = 110 + r * 26;
      spans.push(
        span({ text: `CODE${r}(Company ${r})`, x: 53, baseline: y, width: 120, fontSize: 8 }),
        span({ text: 'US', x: 340, baseline: y, width: 14, fontSize: 8 }),
        span({ text: 'USD', x: 420, baseline: y, width: 20, fontSize: 8 }),
        span({ text: String(100 + r), x: 560, baseline: y, width: 20, fontSize: 8 }),
        span({ text: `${(r + 1) * 1000}.00`, x: 740, baseline: y, width: 45, fontSize: 8 }),
      );
    }
    const tables = detectRowRuledTables(segments, spans, 0, order(), new Set());
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toBe(12);
    expect(tables[0].cols).toBe(5);
  });

  it('页眉线和页脚线之间的双栏正文不会被当成表', () => {
    const segments = [hRule(60, 53, 789), hRule(560, 53, 789)];
    const spans: ReturnType<typeof span>[] = [];
    for (let r = 0; r < 20; r++) {
      const y = 90 + r * 14;
      spans.push(
        line(`左栏第${r}行的正文内容比较长，占了整个栏宽。`, 53, y, 340, { fontSize: 10 }),
        line(`右栏第${r}行的正文内容同样比较长，也占满栏宽。`, 430, y, 340, { fontSize: 10 }),
      );
    }
    expect(detectRowRuledTables(segments, spans, 0, order(), new Set())).toHaveLength(0);
  });
});
