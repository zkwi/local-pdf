import { describe, expect, it } from 'vitest';
import type { OcrResultItem } from '@paddleocr/paddleocr-js';
import { languageSpec, OCR_LANGUAGES } from '../src/core/ocr/languages.ts';
import { paddleItemsToSpans } from '../src/core/ocr/paddle.ts';
import { localModelUrl, selectPaddleModels } from '../src/core/ocr/paddle-models.ts';
import type { PrimitivePage, PrimitiveTextSpan } from '../src/core/contracts/primitives.ts';
import {
  estimateOcrFontSize,
  isScanWithTextLayer,
  normalizeOcrBullets,
  shouldRunOcr,
  snapFontSizes,
  unifyOcrFontSizes,
} from '../src/core/ocr/engine.ts';
import { span } from './helpers.ts';

const item = (poly: [number, number][], text: string, score = 0.95): OcrResultItem => ({
  poly,
  text,
  score,
});

describe('paddleItemsToSpans', () => {
  it('四边形框按渲染倍率换算回页面坐标', () => {
    // 六个汉字、20pt 高、120pt 宽：中文行的字号按框宽 / 字数估（20），不按框高（18）
    const spans = paddleItemsToSpans(
      [
        item(
          [
            [300, 600],
            [660, 600],
            [660, 660],
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
    expect(s.bbox.width).toBeCloseTo(120);
    expect(s.bbox.height).toBeCloseTo(20);
    expect(s.baseline).toBeGreaterThan(s.bbox.y + s.bbox.height * 0.7);
    expect(s.baseline).toBeLessThan(s.bbox.y + s.bbox.height);
    expect(s.fontSize).toBeCloseTo(20);
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

describe('estimateOcrFontSize', () => {
  it('中文为主的行按框宽 / 字数估，不受勾选框把框撑高的影响', () => {
    // 14 个全角字 140pt 宽 → 10pt；按框高会估成 17
    expect(estimateOcrFontSize('功能模块：文本生成、图片合成', 140, 19, false)).toBeCloseTo(10);
  });

  it('西文行和字太少的短行仍按框高估', () => {
    expect(estimateOcrFontSize('XMP-tc260', 51, 11, false)).toBeCloseTo(9.9);
    expect(estimateOcrFontSize('图片', 24, 14, false)).toBeCloseTo(12.6);
  });

  it('竖排按框宽估', () => {
    expect(estimateOcrFontSize('竖排的一行文字', 20, 140, true)).toBeCloseTo(18);
  });
});

describe('normalizeOcrBullets', () => {
  const ocr = (init: Parameters<typeof span>[0], confidence = 1): PrimitiveTextSpan => ({
    ...span(init),
    source: 'ocr',
    confidence,
  });

  it('行首很小的 "O" 改成实心圆点，字号和置信度跟着它那一行', () => {
    const spans = [
      ocr({
        text: '使用“AI生成”提示文字，位于图片、视频下方。',
        x: 79,
        baseline: 645,
        fontSize: 12.3,
      }),
      ocr({ text: 'O', x: 101, baseline: 667, fontSize: 4.5, width: 4.7 }, 0.44),
      ocr({ text: '显式标识位置示例图', x: 128.3, baseline: 670.3, fontSize: 12.3 }, 0.99),
    ];
    const out = normalizeOcrBullets(spans);
    expect(out[1].text).toBe('• ');
    expect(out[1].fontSize).toBe(12.3);
    expect(out[1].confidence).toBe(0.99);
    expect(out[0]).toBe(spans[0]);
  });

  it('正常大小的 "o"、不在行首的、右边没有文字的都不动', () => {
    const spans = [
      ocr({ text: '这是一行正文的内容', x: 79, baseline: 100, fontSize: 12 }),
      ocr({ text: 'o', x: 79, baseline: 122, fontSize: 12 }),
      ocr({ text: '接口', x: 79, baseline: 144, fontSize: 12 }),
      ocr({ text: 'o', x: 110, baseline: 144, fontSize: 4 }),
      ocr({ text: 'o', x: 79, baseline: 166, fontSize: 4 }),
    ];
    const out = normalizeOcrBullets(spans);
    expect(out.map((s) => s.text)).toEqual(spans.map((s) => s.text));
  });
});

describe('unifyOcrFontSizes', () => {
  const page = (index: number, size: number, chars: number, ocrApplied: boolean): PrimitivePage => {
    const s: PrimitiveTextSpan = {
      ...span({ text: '字'.repeat(chars), x: 72, baseline: 100, fontSize: size }),
      source: ocrApplied ? 'ocr' : 'native-pdf',
    };
    return {
      index,
      width: 595,
      height: 842,
      rotation: 0,
      spans: [s, { ...s, id: `${index}-title`, text: '标题', fontSize: size * 1.6 }],
      images: [],
      segments: [],
      links: [],
      textHealth: {
        charCount: chars,
        printableRatio: 1,
        replacementRatio: 0,
        imageCoverage: 1,
        textCoverage: 0.3,
        suspicious: false,
        hiddenText: false,
      },
      ocrApplied,
    };
  };

  it('相近的页正文字号统一成文档主流字号，差得远的页和原生页不动', () => {
    const pages = unifyOcrFontSizes([
      page(0, 14.4, 100, true),
      page(1, 12.3, 300, true),
      page(2, 9, 50, true),
      page(3, 14.4, 200, false),
    ]);
    expect(pages[0].spans[0].fontSize).toBe(12.3);
    // 标题不是主流字号，保持原值
    expect(pages[0].spans[1].fontSize).toBeCloseTo(14.4 * 1.6);
    expect(pages[1].spans[0].fontSize).toBe(12.3);
    expect(pages[2].spans[0].fontSize).toBe(9);
    expect(pages[3].spans[0].fontSize).toBe(14.4);
  });

  it('没有 OCR 页时原样返回', () => {
    const input = [page(0, 12, 100, false)];
    expect(unifyOcrFontSizes(input)[0]).toBe(input[0]);
  });
});
