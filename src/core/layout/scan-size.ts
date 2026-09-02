/**
 * 扫描页的尺寸归一化。扫描件的页面尺寸是扫描仪或截图工具随手定的：
 * A4 纸扫成 1215×1715 pt（字号 20），手机长截图 213 pt 宽（字号 7），
 * 网页整页截图 1920 pt 宽。原样交给 Word 就是 15×22 英寸的巨页配大字，
 * 或者 A4 纸上 7 号的小字，还都跟着页数翻倍。
 * 这些页的文字本来就是 OCR 认出来的，没有"原始版式"可言，按可读性把整页缩放到 A4 的尺度。
 */
import type {
  PrimitiveImage,
  PrimitiveLink,
  PrimitivePage,
  PrimitiveSegment,
  PrimitiveTextSpan,
} from '../contracts/primitives.ts';
import type { BBox } from '../contracts/geometry.ts';
import { dominantFontSize, isScanWithTextLayer } from '../ocr/engine.ts';
import type { ExtractedImage } from './analyze.ts';

const A4 = { width: 595.28, height: 841.89 };
/** 页宽（横版看页高）与 A4 相差不到这个比例的不动 */
const SIZE_TOLERANCE = 0.3;
/** 长条页（高宽比超过这个值）反正要在 A4 上重排，只按字号缩放 */
const STRIP_ASPECT = 2;
/** 重排后的正文字号目标 */
const TARGET_BODY_PT = 10.5;
/** 缩小整页时正文字号不低于这个值 */
const MIN_BODY_PT = 8;

/** 这一页要缩放的倍率；1 表示不动 */
export function scanPageScale(page: PrimitivePage): number {
  if (!(page.ocrApplied || isScanWithTextLayer(page))) return 1;
  const body = dominantFontSize(page.spans);
  if (page.height / page.width > STRIP_ASPECT) {
    if (body <= 0) return 1;
    const k = TARGET_BODY_PT / body;
    return Math.abs(k - 1) < 0.1 ? 1 : k;
  }
  const landscape = page.width > page.height;
  const target = landscape ? A4.height : A4.width;
  if (Math.abs(page.width - target) <= target * SIZE_TOLERANCE) return 1;
  let k = target / page.width;
  if (body > 0 && body * k < MIN_BODY_PT) k = MIN_BODY_PT / body;
  if (body > 0 && k > 1) k = Math.min(k, TARGET_BODY_PT / body);
  return Math.abs(k - 1) < 0.1 ? 1 : k;
}

function scaleBox(b: BBox, k: number): BBox {
  return { x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k };
}

export function scalePage(page: PrimitivePage, k: number): PrimitivePage {
  if (k === 1) return page;
  const spans: PrimitiveTextSpan[] = page.spans.map((s) => ({
    ...s,
    bbox: scaleBox(s.bbox, k),
    baseline: s.baseline * k,
    fontSize: s.fontSize * k,
  }));
  const images: PrimitiveImage[] = page.images.map((i) => ({ ...i, bbox: scaleBox(i.bbox, k) }));
  const segments: PrimitiveSegment[] = page.segments.map((s) => ({
    ...s,
    start: s.start * k,
    end: s.end * k,
    position: s.position * k,
    thickness: s.thickness * k,
  }));
  const links: PrimitiveLink[] = page.links.map((l) => ({ ...l, bbox: scaleBox(l.bbox, k) }));
  return {
    ...page,
    width: page.width * k,
    height: page.height * k,
    spans,
    images,
    segments,
    links,
  };
}

export interface NormalizedScans {
  readonly pages: PrimitivePage[];
  readonly images: Map<string, ExtractedImage>;
  /** 被缩放过的页下标 */
  readonly scaledPages: number[];
}

/** 对整份文档里的扫描页做尺寸归一化，裁出来的图片尺寸一起缩放 */
export function normalizeScanPages(
  pages: readonly PrimitivePage[],
  images: ReadonlyMap<string, ExtractedImage>,
): NormalizedScans {
  const out = new Map(images);
  const scaledPages: number[] = [];
  const result = pages.map((page) => {
    const k = scanPageScale(page);
    if (k === 1) return page;
    scaledPages.push(page.index);
    for (const image of page.images) {
      const stored = out.get(image.id);
      if (stored)
        out.set(image.id, {
          ...stored,
          widthPt: stored.widthPt * k,
          heightPt: stored.heightPt * k,
        });
    }
    return scalePage(page, k);
  });
  return { pages: result, images: out, scaledPages };
}
