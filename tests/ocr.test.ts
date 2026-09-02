import { describe, expect, it } from 'vitest';
import type { OcrResultItem } from '@paddleocr/paddleocr-js';
import { languageSpec, OCR_LANGUAGES } from '../src/core/ocr/languages.ts';
import { paddleItemsToSpans } from '../src/core/ocr/paddle.ts';
import { localModelUrl, selectPaddleModels } from '../src/core/ocr/paddle-models.ts';

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
