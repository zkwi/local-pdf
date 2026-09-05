import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../src/core/contracts/options.ts';
import type { PrimitivePage } from '../src/core/contracts/primitives.ts';
import { analyzeDocument, isFullPageImage } from '../src/core/layout/analyze.ts';
import { splitTallScanImages } from '../src/core/layout/scan-size.ts';
import { span } from './helpers.ts';

const page: PrimitivePage = {
  index: 0,
  width: 200,
  height: 3000,
  rotation: 0,
  ocrApplied: true,
  spans: [
    span({ text: '扫描图里的文字不应再重复输出', x: 20, baseline: 40 }),
    span({ text: '图片外的文字需要保留', x: 20, baseline: 400 }),
  ],
  images: [
    { id: 'tile', pageIndex: 0, isMask: false, bbox: { x: 0, y: 0, width: 200, height: 200 } },
  ],
  segments: [],
  links: [],
  textHealth: {
    charCount: 40,
    printableRatio: 1,
    replacementRatio: 0,
    imageCoverage: 1,
    textCoverage: 0.1,
    suspicious: false,
    hiddenText: true,
  },
};
const store = new Map([
  ['tile', { data: new Uint8Array([1]), format: 'png' as const, widthPt: 200, heightPt: 200 }],
]);
const analyze = (input: PrimitivePage, images = store, options = DEFAULT_OPTIONS) =>
  analyzeDocument(
    { metadata: { pageCount: 1, sourceFileName: 'synthetic.pdf' }, pages: [input] },
    images,
    options,
  ).pages[0];

describe('扫描图保留', () => {
  it('宽幅图表不等于整页扫描图', () => {
    expect(isFullPageImage(page.images[0], page)).toBe(false);
    expect(isFullPageImage({ bbox: { width: 200, height: 3000 } }, page)).toBe(true);
  });

  it('保住图表并去掉重复文字，报告明确降级', () => {
    const result = analyze(page);
    expect(result.blocks.filter((b) => b.kind === 'image')).toHaveLength(1);
    const text = result.blocks
      .flatMap((b) => ('lines' in b ? b.lines.map((l) => l.text) : []))
      .join('');
    expect(text).not.toContain('扫描图里的文字');
    expect(text).toContain('图片外的文字');
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.warnings.map((w) => w.code)).toContain('scan-image-fallback');
  });

  it('裁图失败或用户关闭图片时，不能再删文字', () => {
    for (const result of [
      analyze(page, new Map()),
      analyze(page, store, { ...DEFAULT_OPTIONS, extractImages: false }),
    ]) {
      const text = result.blocks
        .flatMap((b) => ('lines' in b ? b.lines.map((l) => l.text) : []))
        .join('');
      expect(text).toContain('扫描图里的文字');
    }
  });

  it('单张超长图切成连续的可读段，不遗漏尾部', () => {
    const result = splitTallScanImages({
      ...page,
      images: [{ ...page.images[0], bbox: { x: 0, y: 0, width: 200, height: 3000 } }],
    });
    expect(result.images.length).toBeGreaterThan(1);
    expect(result.images.reduce((n, im) => n + im.bbox.height, 0)).toBe(3000);
    expect(
      result.images.every(
        (im, i) =>
          i === 0 || im.bbox.y === result.images[i - 1].bbox.y + result.images[i - 1].bbox.height,
      ),
    ).toBe(true);
  });

  it('普通页面里的窄长插图不切分，异常长页的段数有上限', () => {
    const ordinary = {
      ...page,
      width: 595,
      height: 842,
      images: [{ ...page.images[0], bbox: { x: 10, y: 10, width: 30, height: 200 } }],
    };
    expect(splitTallScanImages(ordinary)).toBe(ordinary);
    const huge = {
      ...page,
      height: 1e8,
      images: [{ ...page.images[0], bbox: { x: 0, y: 0, width: 200, height: 1e8 } }],
    };
    expect(splitTallScanImages(huge).images).toHaveLength(1000);
  });
});
