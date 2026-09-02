import { describe, expect, it } from 'vitest';
import type { OcrResultItem } from '@paddleocr/paddleocr-js';
import { languageSpec, OCR_LANGUAGES } from '../src/core/ocr/languages.ts';
import { paddleItemsToSpans } from '../src/core/ocr/paddle.ts';
import { localModelUrl, selectPaddleModels } from '../src/core/ocr/paddle-models.ts';
import type { PrimitivePage, PrimitiveTextSpan } from '../src/core/contracts/primitives.ts';
import { isScanWithTextLayer, shouldRunOcr, snapFontSizes } from '../src/core/ocr/engine.ts';

const item = (poly: [number, number][], text: string, score = 0.95): OcrResultItem => ({
  poly,
  text,
  score,
});

describe('paddleItemsToSpans', () => {
  it('四边形框按渲染倍率换算回页面坐标', () => {
    const spans = paddleItemsToSpans(
      [
        item(
          [
            [300, 600],
            [900, 600],
            [900, 660],
            [300, 660],
          ],
          '这是一行中文',
        ),
      ],
      3,
      4,
    );
    expect(spans).toHaveLength(1);
    const s = spans[0];
    expect(s.bbox.x).toBeCloseTo(100);
    expect(s.bbox.y).toBeCloseTo(200);
    expect(s.bbox.width).toBeCloseTo(200);
    expect(s.bbox.height).toBeCloseTo(20);
    expect(s.baseline).toBeGreaterThan(s.bbox.y + s.bbox.height * 0.7);
    expect(s.baseline).toBeLessThan(s.bbox.y + s.bbox.height);
    expect(s.fontSize).toBeCloseTo(18);
    expect(s.pageIndex).toBe(4);
    expect(s.source).toBe('ocr');
    expect(s.confidence).toBeCloseTo(0.95);
    expect(s.vertical).toBe(false);
  });

  it('空文本丢弃，置信度截到 0~1', () => {
    const spans = paddleItemsToSpans(
      [
        item(
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
          '   ',
        ),
        item(
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
          'ok',
          1.7,
        ),
      ],
      1,
      0,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].confidence).toBe(1);
  });

  it('输出按基线再按 x 排序，方便后续行聚类', () => {
    const box = (x: number, y: number): [number, number][] => [
      [x, y],
      [x + 50, y],
      [x + 50, y + 10],
      [x, y + 10],
    ];
    const spans = paddleItemsToSpans(
      [item(box(200, 100), 'c'), item(box(0, 100), 'a'), item(box(0, 20), 'top')],
      1,
      0,
    );
    expect(spans.map((s) => s.text)).toEqual(['top', 'a', 'c']);
  });

  it('接近竖直的框标记为竖排', () => {
    const spans = paddleItemsToSpans(
      [
        item(
          [
            [100, 0],
            [100, 300],
            [80, 300],
            [80, 0],
          ],
          '竖排',
        ),
      ],
      1,
      0,
    );
    expect(spans[0].vertical).toBe(true);
    expect(spans[0].rotation).toBe(90);
  });
});

describe('selectPaddleModels', () => {
  it('极速档用 tiny，高精度档用 small', () => {
    expect(selectPaddleModels('fast', 'zh').det.name).toBe('PP-OCRv6_tiny_det');
    expect(selectPaddleModels('balanced', 'zh').rec.name).toBe('PP-OCRv6_small_rec');
  });

  it('tiny 不支持日文，自动升到 small', () => {
    const s = selectPaddleModels('fast', 'ja');
    expect(s.quality).toBe('balanced');
    expect(s.lang).toBe('japan');
    expect(s.det.name).toBe('PP-OCRv6_small_det');
  });

  it('总字节数等于两份模型之和', () => {
    const s = selectPaddleModels('fast', 'en');
    expect(s.totalBytes).toBe(s.det.bytes + s.rec.bytes);
  });

  it('本地模型 URL 落在 ocr-models/ 下', () => {
    const s = selectPaddleModels('fast', 'zh');
    expect(localModelUrl('https://x/app/', s.det)).toBe(
      'https://x/app/ocr-models/PP-OCRv6_tiny_det_onnx_infer.tar',
    );
  });
});

describe('languageSpec', () => {
  it('每种语言都有 PaddleOCR 的 lang 映射', () => {
    for (const lang of OCR_LANGUAGES) expect(lang.paddle).toBeTruthy();
    expect(languageSpec('zh-Hant').paddle).toBe('chinese_cht');
  });
});

const fakeSpan = (text: string, y: number, rotation = 0): PrimitiveTextSpan => ({
  id: `s${y}-${text.length}`,
  pageIndex: 0,
  text,
  bbox: { x: 50, y, width: 80, height: 9 },
  baseline: y + 8,
  fontSize: 9,
  fontKey: 'f',
  fontName: 'f',
  fontFamily: 'sans-serif',
  bold: false,
  italic: false,
  rotation,
  vertical: false,
  source: 'native-pdf',
  confidence: 1,
  hasEOL: false,
});

const fakePage = (
  spans: PrimitiveTextSpan[],
  imageCoverage: number,
  hiddenText = false,
): PrimitivePage => ({
  index: 0,
  width: 595,
  height: 842,
  rotation: 0,
  spans,
  images: [],
  segments: [],
  links: [],
  textHealth: {
    charCount: spans.reduce((n, s) => n + s.text.trim().length, 0),
    printableRatio: 1,
    replacementRatio: 0,
    imageCoverage,
    textCoverage: 0.05,
    suspicious: false,
    hiddenText,
  },
  ocrApplied: false,
});

// 页眉一行 + 斜着的水印 + 右下角页码，一共三十多个字
const decorative = [
  fakeSpan('淘宝：考试大神店 更新：2022.08.28 已备案知识产权，侵权必究', 26),
  fakeSpan('考试大神店', 321, 315),
  fakeSpan('99', 822),
];

describe('shouldRunOcr', () => {
  it('整页是图、文字层只有页眉、页码和水印：要 OCR', () => {
    expect(shouldRunOcr(fakePage(decorative, 0.86), 'auto')).toBe(true);
  });

  it('正文区有真实文字（图注）：不 OCR', () => {
    const withCaption = [...decorative, fakeSpan('图 3-1 系统架构示意', 700)];
    expect(shouldRunOcr(fakePage(withCaption, 0.86), 'auto')).toBe(false);
  });

  it('图不够大时不 OCR；策略 off / force 直接决定', () => {
    expect(shouldRunOcr(fakePage(decorative, 0.4), 'auto')).toBe(false);
    expect(shouldRunOcr(fakePage(decorative, 0.86), 'off')).toBe(false);
    expect(shouldRunOcr(fakePage([], 0), 'force')).toBe(true);
  });
});

describe('isScanWithTextLayer', () => {
  const body = Array.from({ length: 14 }, (_, i) =>
    fakeSpan('这是一行有二十多个字的正文文字内容，用来凑够字数。', 100 + i * 14),
  );

  it('全是不可见文字且不稀疏：是带文字层的扫描页', () => {
    expect(isScanWithTextLayer(fakePage(body, 1, true))).toBe(true);
  });

  it('文字可见、或只有零星标签：不是', () => {
    expect(isScanWithTextLayer(fakePage(body, 1, false))).toBe(false);
    expect(
      isScanWithTextLayer(fakePage([fakeSpan('图 1', 300), fakeSpan('表 2', 400)], 1, true)),
    ).toBe(false);
  });
});

describe('snapFontSizes', () => {
  const at = (text: string, size: number): PrimitiveTextSpan => ({
    ...fakeSpan(text, 100),
    fontSize: size,
  });

  it('主流字号附近的都吸附过去，明显大的保留，离谱的压到上限', () => {
    const spans = [
      at('这是正文第一行的文字内容', 9.5),
      at('这是正文第二行的文字内容', 11.2),
      at('这是正文第三行的文字内容', 10.1),
      at('章节标题', 15),
      at('。', 143),
    ];
    const sizes = snapFontSizes(spans).map((s) => s.fontSize);
    expect(sizes.slice(0, 3)).toEqual([10.1, 10.1, 10.1]);
    expect(sizes[3]).toBe(15);
    expect(sizes[4]).toBeCloseTo(30.3, 1);
  });

  it('没有文字时原样返回', () => {
    expect(snapFontSizes([])).toEqual([]);
  });
});
