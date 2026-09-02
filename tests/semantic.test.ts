import { describe, expect, it } from 'vitest';
import { buildLines } from '../src/core/layout/lines.ts';
import { lineSpacingFor, linesToRuns } from '../src/core/semantic/build.ts';
import { ptToHalfPoint, ptToPx96, ptToTwip } from '../src/core/geometry/units.ts';
import { cleanFontName, mapFont } from '../src/core/docx/fonts.ts';
import { isSparseOcr, mergeOcrSpans, shouldRunOcr } from '../src/core/ocr/engine.ts';
import { line, span } from './helpers.ts';

describe('linesToRuns', () => {
  it('相同样式的相邻片段合并成一个 run', () => {
    const { lines } = buildLines([
      span({ text: '普通', x: 72, baseline: 100 }),
      span({ text: '文字', x: 83, baseline: 100 }),
    ]);
    const runs = linesToRuns(lines);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('普通文字');
  });

  it('粗体片段单独成 run', () => {
    const { lines } = buildLines([
      span({ text: '普通', x: 72, baseline: 100 }),
      span({ text: '加粗', x: 83, baseline: 100, bold: true }),
    ]);
    const runs = linesToRuns(lines);
    expect(runs).toHaveLength(2);
    expect(runs[1].bold).toBe(true);
  });

  it('多行按中英文规则拼接', () => {
    const { lines } = buildLines([
      line('the quick brown', 72, 100, 90),
      line('fox jumps', 72, 114, 60),
    ]);
    expect(linesToRuns(lines)[0].text).toBe('the quick brown fox jumps');
  });

  it('中文多行不产生空格', () => {
    const { lines } = buildLines([
      line('这是第一行中文内容', 72, 100, 90),
      line('这是第二行中文内容', 72, 114, 90),
    ]);
    expect(linesToRuns(lines)[0].text).toBe('这是第一行中文内容这是第二行中文内容');
  });
});

describe('单位换算', () => {
  it('pt → twip / half-point / px96', () => {
    expect(ptToTwip(12)).toBe(240);
    expect(ptToHalfPoint(10.5)).toBe(21);
    expect(ptToPx96(72)).toBeCloseTo(96);
  });

  it('字号不会取到 0', () => {
    expect(ptToHalfPoint(0)).toBe(2);
  });
});

describe('字体映射', () => {
  it('去掉子集前缀', () => {
    expect(cleanFontName('ABCDEE+Calibri')).toBe('Calibri');
  });

  it('中文字体映射到 eastAsia', () => {
    expect(mapFont('SimSun', 'serif').eastAsia).toBe('宋体');
    expect(mapFont('MicrosoftYaHei', 'sans-serif').eastAsia).toBe('微软雅黑');
  });

  it('未知字体按 family 回退', () => {
    expect(mapFont('SomeUnknownFont', 'monospace').ascii).toBe('Consolas');
    expect(mapFont(undefined, 'serif').ascii).toBe('Times New Roman');
  });
});

describe('OCR 触发判断', () => {
  const page = (charCount: number, imageCoverage: number, suspicious = false) => ({
    index: 0,
    width: 595,
    height: 842,
    rotation: 0,
    spans: [],
    images: [],
    segments: [],
    links: [],
    ocrApplied: false,
    textHealth: {
      hiddenText: false,
      charCount,
      printableRatio: 1,
      replacementRatio: 0,
      imageCoverage,
      textCoverage: 0,
      suspicious,
    },
  });

  it('原生文字页面默认不 OCR', () => {
    expect(shouldRunOcr(page(1800, 0.05), 'auto')).toBe(false);
  });

  it('整页图片没有文字时触发 OCR', () => {
    expect(shouldRunOcr(page(0, 0.95), 'auto')).toBe(true);
  });

  it('乱码页面触发 OCR', () => {
    expect(shouldRunOcr(page(900, 0, true), 'auto')).toBe(true);
  });

  it('关闭时永不触发，强制时永远触发', () => {
    expect(shouldRunOcr(page(0, 0.95), 'off')).toBe(false);
    expect(shouldRunOcr(page(1800, 0), 'force')).toBe(true);
  });
});

describe('mergeOcrSpans', () => {
  it('与原生文字重叠的 OCR 结果被丢弃', () => {
    const native = [span({ text: '原生', x: 72, baseline: 100 })];
    const ocr = [
      { ...span({ text: '原生', x: 73, baseline: 100 }), source: 'ocr' as const },
      { ...span({ text: '新增', x: 300, baseline: 400 }), source: 'ocr' as const },
    ];
    const merged = mergeOcrSpans(native, ocr);
    expect(merged.map((s) => s.text)).toEqual(['原生', '新增']);
  });
});

describe('pageNumberAware', () => {
  it('跨页变化的数字换成页码域，不变的数字保留', async () => {
    const { pageNumberAware } = await import('../src/core/semantic/build.ts');
    const page = (n: number) => buildLines([line(`白皮书 2025 - ${n} -`, 72, 20, 150)]).lines;
    const paragraph = pageNumberAware([page(85), page(86), page(87)], 'center');
    const fields = paragraph.runs.filter((r) => r.field === 'page-number');
    expect(fields).toHaveLength(1);
    expect(paragraph.runs.map((r) => r.text).join('')).toBe('白皮书 2025 -  -');
  });

  it('只有一页可比时，整条是数字才算页码', async () => {
    const { pageNumberAware } = await import('../src/core/semantic/build.ts');
    const only = buildLines([line('- 3 -', 72, 20, 30)]).lines;
    expect(pageNumberAware([only], 'center').runs.some((r) => r.field === 'page-number')).toBe(
      true,
    );
    const title = buildLines([line('2025 年报', 72, 20, 60)]).lines;
    expect(pageNumberAware([title], 'center').runs.some((r) => r.field === 'page-number')).toBe(
      false,
    );
  });
});

describe('isSparseOcr', () => {
  it('封面上的几个字算零星', () => {
    expect(
      isSparseOcr([line('2025/26 年度', 72, 100, 80), line('中国量化投资白皮书', 72, 130, 120)]),
    ).toBe(true);
  });

  it('图表上几十个短标签算零星', () => {
    const labels = Array.from({ length: 30 }, (_, i) => line(`${2000 + i}`, 72 + i * 15, 300, 14));
    expect(isSparseOcr(labels)).toBe(true);
  });

  it('两行正文就不算零星，哪怕总字数不多', () => {
    expect(
      isSparseOcr([
        line('Scanned Page Without Text Layer', 72, 100, 200),
        line(
          'This page has been rasterized so no text layer remains. Only OCR can recover it.',
          72,
          130,
          400,
        ),
      ]),
    ).toBe(false);
  });
});

describe('lineSpacingFor', () => {
  it('多行段落按量到的基线间距精确排；行里有明显更大的字时不用 exact', () => {
    const { lines } = buildLines([
      line('第一行第一行第一行', 72, 100, 200),
      line('第二行第二行第二行', 72, 117, 200),
      line('第三行第三行第三行', 72, 134, 200),
    ]);
    expect(lineSpacingFor(lines, 0)).toEqual({ lineSpacing: 1.7, lineRule: 'exact' });

    const mixed = buildLines([
      line('正文正文', 72, 100, 100),
      span({ text: '大字', x: 180, baseline: 100, fontSize: 16 }),
      line('第二行第二行', 72, 112, 200),
    ]).lines;
    expect(lineSpacingFor(mixed, 0).lineRule).toBe('atLeast');
  });

  it('单行段落借用本页正文行距；字号差得远或没有本页行距时退回 1.15 倍', () => {
    const { lines } = buildLines([line('单独一行', 72, 100, 80)]);
    expect(lineSpacingFor(lines, 17)).toEqual({ lineSpacing: 1.7, lineRule: 'exact' });
    expect(lineSpacingFor(lines, 0)).toEqual({ lineSpacing: 1.15, lineRule: 'atLeast' });
    const big = buildLines([line('大标题', 72, 100, 80, { fontSize: 24 })]).lines;
    expect(lineSpacingFor(big, 17)).toEqual({ lineSpacing: 1.15, lineRule: 'atLeast' });
  });
});

describe('estimateSpaceAfter', () => {
  it('段间和段内行距相同时段后距为 0；多出来的空白才是段后距', async () => {
    const { estimateSpaceAfter } = await import('../src/core/semantic/build.ts');
    const { buildLines } = await import('../src/core/layout/lines.ts');
    const { buildBlocksForRegion } = await import('../src/core/layout/blocks.ts');
    const { segmentRegions } = await import('../src/core/layout/regions.ts');
    const { lines } = buildLines([
      line('第一段第一行第一段第一行第一段第一行第一段第一行', 72, 100, 400, { fontSize: 16 }),
      line('第一段第二行。', 72, 128, 120, { fontSize: 16 }),
      line('第二段第一行第二段第一行第二段第一行第二段第一行', 72, 156, 400, { fontSize: 16 }),
      line('第二段第二行。', 72, 184, 120, { fontSize: 16 }),
      line('第三段第一行第三段第一行第三段第一行第三段第一行', 72, 232, 400, { fontSize: 16 }),
    ]);
    const ctx = { pageIndex: 0, bodyFontSize: 16, order: 0 };
    const blocks = segmentRegions(lines, 595, Number.POSITIVE_INFINITY).regions.flatMap((r) =>
      buildBlocksForRegion(r, ctx),
    );
    expect(blocks).toHaveLength(3);
    expect(estimateSpaceAfter(blocks[0], blocks[1], 16, 28)).toBe(0);
    expect(estimateSpaceAfter(blocks[1], blocks[2], 16, 28)).toBe(20);
    expect(estimateSpaceAfter(blocks[2], undefined, 16, 28)).toBe(0);
  });
});
