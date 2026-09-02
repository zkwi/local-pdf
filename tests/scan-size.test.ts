import { describe, expect, it } from 'vitest';
import type { PrimitivePage } from '../src/core/contracts/primitives.ts';
import { normalizeScanPages, scanPageScale } from '../src/core/layout/scan-size.ts';
import { line } from './helpers.ts';

function scanPage(
  width: number,
  height: number,
  fontSize: number,
  ocrApplied = true,
): PrimitivePage {
  const spans = Array.from({ length: 6 }, (_, i) => ({
    ...line('扫描出来的一行正文扫描出来的一行正文', 40, 100 + i * fontSize * 1.5, width * 0.8, {
      fontSize,
    }),
    source: 'ocr' as const,
  }));
  return {
    index: 0,
    width,
    height,
    rotation: 0,
    spans,
    images: [{ id: 'img0', pageIndex: 0, bbox: { x: 0, y: 0, width, height }, isMask: false }],
    segments: [],
    links: [],
    textHealth: {
      charCount: 100,
      printableRatio: 1,
      replacementRatio: 0,
      imageCoverage: 1,
      textCoverage: 0.5,
      suspicious: false,
      hiddenText: false,
    },
    ocrApplied,
  };
}

describe('scanPageScale', () => {
  it('A4 大小的扫描页不动，原生页不动', () => {
    expect(scanPageScale(scanPage(595, 842, 10.5))).toBe(1);
    expect(scanPageScale(scanPage(1215, 1715, 20, false))).toBe(1);
  });

  it('按两倍尺寸存的 A4 扫描页缩到 A4 宽，字号跟着变小', () => {
    const k = scanPageScale(scanPage(1215, 1715, 20));
    expect(k).toBeCloseTo(595.28 / 1215, 3);
    expect(20 * k).toBeGreaterThan(9);
  });

  it('横版扫描页按 A4 高度对齐', () => {
    expect(scanPageScale(scanPage(1715, 1215, 20))).toBeCloseTo(841.89 / 1715, 3);
  });

  it('手机长截图（窄长条）按字号放大到正文 10.5 号', () => {
    const k = scanPageScale(scanPage(213, 6000, 7));
    expect(7 * k).toBeCloseTo(10.5, 3);
  });

  it('网页整页截图（又宽又长）按字号缩小，不按宽度缩到字看不清', () => {
    const k = scanPageScale(scanPage(1920, 14400, 18.5));
    expect(18.5 * k).toBeCloseTo(10.5, 3);
  });

  it('缩小整页时正文字号不低于 8 号', () => {
    const k = scanPageScale(scanPage(2400, 3000, 12));
    expect(12 * k).toBeCloseTo(8, 3);
  });
});

describe('normalizeScanPages', () => {
  it('页面、文字框、字号和裁出来的图一起缩放', () => {
    const page = scanPage(1215, 1715, 20);
    const images = new Map([
      ['img0', { data: new Uint8Array(1), format: 'png' as const, widthPt: 1215, heightPt: 1715 }],
    ]);
    const result = normalizeScanPages([page], images);
    const k = 595.28 / 1215;
    expect(result.scaledPages).toEqual([0]);
    expect(result.pages[0].width).toBeCloseTo(595.28, 2);
    expect(result.pages[0].spans[0].fontSize).toBeCloseTo(20 * k, 3);
    expect(result.pages[0].spans[0].bbox.x).toBeCloseTo(40 * k, 3);
    expect(result.pages[0].images[0].bbox.width).toBeCloseTo(595.28, 2);
    expect(result.images.get('img0')?.widthPt).toBeCloseTo(595.28, 2);
  });
});
