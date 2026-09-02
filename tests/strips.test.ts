import { describe, expect, it } from 'vitest';
import { mergeStripSpans, planStrips, STRIP_HEIGHT_PT } from '../src/core/ocr/strips.ts';
import { mapSymbolFontText } from '../src/core/pdf/symbols.ts';
import { wordPageSize } from '../src/core/semantic/build.ts';
import { line } from './helpers.ts';

describe('planStrips', () => {
  it('长页切成带重叠的条，最后一条到页底为止', () => {
    const strips = planStrips(2000);
    expect(strips[0]).toEqual({ top: 0, height: STRIP_HEIGHT_PT });
    expect(strips[1].top).toBeLessThan(STRIP_HEIGHT_PT);
    const last = strips[strips.length - 1];
    expect(last.top + last.height).toBe(2000);
  });

  it('短页只有一条', () => {
    expect(planStrips(500)).toEqual([{ top: 0, height: 500 }]);
  });
});

describe('mergeStripSpans', () => {
  it('条内坐标换算回页面坐标，重叠区的重复只留一份，贴边被切的丢掉', () => {
    const plans = planStrips(1400);
    const [a, b] = plans;
    // 第一条：一行在中间，一行贴着底边（可能被切断）
    const strip0 = [line('第一行', 10, 100, 60), line('贴底', 10, a.height - 1, 40)];
    // 第二条：重叠区里再次认出 "第一行" 的同位置（页面 y≈100 不在重叠区，这里用重叠区的一行模拟）
    const overlapPageY = a.height - 10;
    const dupInA = line('重叠行', 10, overlapPageY, 60);
    const dupInB = line('重叠行', 10, overlapPageY - b.top, 60);
    const merged = mergeStripSpans(
      [
        { plan: a, spans: [...strip0, dupInA] },
        { plan: b, spans: [dupInB, line('第二条正文', 10, 300, 80)] },
      ],
      1400,
      0,
    );
    const texts = merged.map((s) => s.text);
    expect(texts).toContain('第一行');
    expect(texts).toContain('第二条正文');
    expect(texts.filter((t) => t === '重叠行')).toHaveLength(1);
    expect(texts).not.toContain('贴底');
    const body = merged.find((s) => s.text === '第二条正文');
    expect(body?.baseline).toBeCloseTo(300 + b.top);
    expect(new Set(merged.map((s) => s.id)).size).toBe(merged.length);
  });
});

describe('wordPageSize', () => {
  it('普通页原样保留', () => {
    expect(wordPageSize(595, 842)).toEqual({ width: 595, height: 842, clamped: false });
  });

  it('窄长页改成 A4', () => {
    const size = wordPageSize(213, 11349);
    expect(size.clamped).toBe(true);
    expect(size.height).toBeLessThan(900);
    expect(size.width).toBeGreaterThan(500);
  });

  it('宽高都超的按比例缩到上限', () => {
    const size = wordPageSize(3000, 2000);
    expect(size.clamped).toBe(true);
    expect(Math.max(size.width, size.height)).toBeCloseTo(1584);
    expect(size.width / size.height).toBeCloseTo(1.5);
  });
});

describe('mapSymbolFontText', () => {
  it('Wingdings / Symbol 私用区字符换成通用符号', () => {
    expect(mapSymbolFontText('Wingdings-Regular', '')).toBe('➢');
    expect(mapSymbolFontText('SymbolMT', '')).toBe('•');
    expect(mapSymbolFontText('Wingdings', ' text')).toBe('○ text');
  });

  it('认不出的私用区字符当项目符号', () => {
    expect(mapSymbolFontText('Wingdings', '')).toBe('•');
  });
});
