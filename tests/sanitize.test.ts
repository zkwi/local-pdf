import { describe, expect, it } from 'vitest';
import { clusterBoxes } from '../src/core/geometry/bbox.ts';
import { computeTextHealth, mergeImageTiles } from '../src/core/pdf/extractor.ts';
import { sanitizeText } from '../src/core/util/sanitize.ts';
import { span } from './helpers.ts';

describe('sanitizeText', () => {
  it('去掉 XML 不允许的控制字符，保留换行、制表和正常文字', () => {
    expect(sanitizeText('如果说上述\t指标\n')).toBe('如果说上述\t指标\n');
    expect(sanitizeText('abcde')).toBe('abcde');
    expect(sanitizeText('ok￾￿')).toBe('ok');
    expect(sanitizeText('c1x')).toBe('c1x');
  });

  it('落单的代理项去掉，成对的保留', () => {
    expect(sanitizeText('x\uD83Dy')).toBe('xy');
    expect(sanitizeText('x\uDE00y')).toBe('xy');
    expect(sanitizeText('😀')).toBe('😀');
  });

  it('替换字符 U+FFFD 是合法 XML，保留', () => {
    expect(sanitizeText('a�b')).toBe('a�b');
  });
});

describe('computeTextHealth 用清洗前的原文', () => {
  it('控制符即使被清洗掉，也计入替换率', () => {
    const spans = [span({ text: 'abc', x: 0, baseline: 10 })];
    const health = computeTextHealth(spans, [], 100, 100, 'abc');
    expect(health.replacementRatio).toBeGreaterThan(0.5);
    expect(health.suspicious).toBe(true);
  });
});

describe('clusterBoxes / mergeImageTiles', () => {
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

  it('相交或贴着的框归一组，隔远的分开', () => {
    const groups = clusterBoxes(
      [box(0, 0, 10, 10), box(10.5, 0, 10, 10), box(0, 10.5, 10, 10), box(100, 100, 10, 10)],
      2,
    );
    expect(groups.map((g) => g.length).sort()).toEqual([1, 3]);
  });

  it('图表碎片合并成一张图，孤立图保持原样', () => {
    const tile = (id: string, x: number, y: number) => ({
      id,
      pageIndex: 0,
      bbox: box(x, y, 20, 20),
      isMask: false,
    });
    const merged = mergeImageTiles([
      tile('a', 0, 0),
      tile('b', 21, 0),
      tile('c', 0, 21),
      tile('d', 300, 300),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.id === 'a')?.bbox).toEqual(box(0, 0, 41, 41));
    expect(merged.find((m) => m.id === 'd')?.bbox).toEqual(box(300, 300, 20, 20));
  });
});
