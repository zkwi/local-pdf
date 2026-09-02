import { describe, expect, it } from 'vitest';
import { detectRasterRules } from '../src/core/ocr/rules.ts';
import type { Bitmap } from '../src/core/ocr/rules.ts';

/** 白底画布，按像素画黑色矩形 */
function canvas(
  width: number,
  height: number,
): Bitmap & { fill: (x: number, y: number, w: number, h: number) => void } {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (x: number, y: number, w: number, h: number): void => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const p = (yy * width + xx) * 4;
        data[p] = 20;
        data[p + 1] = 20;
        data[p + 2] = 20;
      }
    }
  };
  return { data, width, height, fill };
}

describe('detectRasterRules', () => {
  it('扫描件上的表格框线找出来，文字笔画、色块、扫描仪黑边都不算', () => {
    const c = canvas(600, 600);
    // 三横三竖的表格，线 2 像素厚
    for (const y of [100, 150, 200]) c.fill(100, y, 300, 2);
    for (const x of [100, 250, 400]) c.fill(x, 100, 2, 102);
    // "文字"：一堆短笔画
    for (let i = 0; i < 40; i++) c.fill(110 + (i % 8) * 30, 110 + Math.floor(i / 8) * 8, 12, 2);
    // 色块（填充的表头）和扫描仪左边的黑边
    c.fill(100, 400, 300, 50);
    c.fill(0, 0, 3, 600);

    const rules = detectRasterRules(c, 1, 0);
    const h = rules.filter((r) => r.orientation === 'horizontal');
    const v = rules.filter((r) => r.orientation === 'vertical');
    expect(h.map((r) => Math.round(r.position))).toEqual([101, 151, 201]);
    expect(v.map((r) => Math.round(r.position))).toEqual([101, 251, 401]);
    expect(h[0].start).toBe(100);
    expect(Math.abs(h[0].end - 400)).toBeLessThanOrEqual(2);
    expect(v[0].start).toBe(100);
  });

  it('扫描歪了一点的线仍是一条横线，坐标按倍率换算回 pt', () => {
    const c = canvas(900, 400);
    // 从 (100,200) 斜到 (700,206)：每 100 像素下降 1 像素
    for (let x = 100; x < 700; x++) c.fill(x, 200 + Math.floor((x - 100) / 100), 1, 2);
    const rules = detectRasterRules(c, 3, 2);
    expect(rules).toHaveLength(1);
    expect(rules[0].orientation).toBe('horizontal');
    expect(rules[0].start).toBeCloseTo(100 / 3, 1);
    expect(rules[0].end).toBeCloseTo(700 / 3, 0);
    expect(rules[0].position).toBeCloseTo(204 / 3, 0);
    expect(rules[0].pageIndex).toBe(2);
  });

  it('JPEG 咬出的小缺口不把线截断，大缺口才分成两条', () => {
    const c = canvas(600, 300);
    c.fill(100, 100, 150, 2);
    c.fill(252, 100, 148, 2); // 缺口 2 像素
    c.fill(100, 200, 100, 2);
    c.fill(260, 200, 140, 2); // 缺口 60 像素
    const h = detectRasterRules(c, 1, 0).filter((r) => r.orientation === 'horizontal');
    expect(h.filter((r) => Math.round(r.position) === 101)).toHaveLength(1);
    expect(h.filter((r) => Math.round(r.position) === 201)).toHaveLength(2);
  });
});
