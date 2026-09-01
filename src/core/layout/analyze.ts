import type {
  ConversionWarning,
  ImageBlock,
  LayoutBlock,
  LayoutDocument,
  LayoutPage,
  TextLine,
} from '../contracts/layout.ts';
import type { ConvertOptions } from '../contracts/options.ts';
import type { PrimitiveDocument, PrimitivePage } from '../contracts/primitives.ts';
import { bottom, contains, overlapRatio1D, right, unionBBox } from '../geometry/bbox.ts';
import { mode } from '../geometry/stats.ts';
import { buildBlocksForRegion } from './blocks.ts';
import { detectHeadersFooters } from './header-footer.ts';
import { buildLines } from './lines.ts';
import { segmentRegions } from './regions.ts';
import { detectTables } from './tables.ts';

export interface ExtractedImage {
  readonly data: Uint8Array;
  readonly widthPt: number;
  readonly heightPt: number;
}

/** imageId -> PNG 数据；由抽取阶段渲染裁剪得到 */
export type ImageStore = ReadonlyMap<string, ExtractedImage>;

const MIN_MARGIN = 18;
const MAX_MARGIN = 108;

export function analyzeDocument(
  doc: PrimitiveDocument,
  images: ImageStore,
  options: ConvertOptions,
): LayoutDocument {
  const warnings: ConversionWarning[] = [];
  const bodyFontSize = estimateBodyFontSize(doc);

  const pageLines = doc.pages.map((page) => {
    const built = buildLines(page.spans);
    if (built.rotatedSpanCount > 0) {
      warnings.push({
        code: 'rotated-text-flattened',
        pageIndex: page.index,
        message: `第 ${page.index + 1} 页有 ${built.rotatedSpanCount} 段旋转文字，已按普通段落输出`,
      });
    }
    if (built.verticalSpanCount > 0) {
      warnings.push({
        code: 'vertical-text-flattened',
        pageIndex: page.index,
        message: `第 ${page.index + 1} 页有竖排文字，已按横排输出`,
      });
    }
    return { index: page.index, height: page.height, lines: built.lines };
  });

  const headerFooter = options.detectHeaderFooter
    ? detectHeadersFooters(pageLines)
    : { headerLineIds: new Map(), footerLineIds: new Map() };

  const pages = doc.pages.map((page, i) =>
    analyzePage(
      page,
      pageLines[i].lines,
      headerFooter.headerLineIds.get(page.index) ?? new Set<string>(),
      headerFooter.footerLineIds.get(page.index) ?? new Set<string>(),
      images,
      options,
      bodyFontSize,
    ),
  );

  return { pages, warnings, bodyFontSize };
}

function estimateBodyFontSize(doc: PrimitiveDocument): number {
  const sizes: number[] = [];
  for (const page of doc.pages) {
    for (const span of page.spans) {
      const weight = Math.min(40, span.text.trim().length);
      for (let i = 0; i < weight; i++) sizes.push(span.fontSize);
    }
  }
  const value = mode(sizes, 0.5);
  return value > 0 ? value : 10.5;
}

function analyzePage(
  page: PrimitivePage,
  allLines: readonly TextLine[],
  headerIds: ReadonlySet<string>,
  footerIds: ReadonlySet<string>,
  images: ImageStore,
  options: ConvertOptions,
  bodyFontSize: number,
): LayoutPage {
  const warnings: ConversionWarning[] = [];
  const headerLines = allLines.filter((l) => headerIds.has(l.id));
  const footerLines = allLines.filter((l) => footerIds.has(l.id));
  const bodyLines = allLines.filter((l) => !headerIds.has(l.id) && !footerIds.has(l.id));

  let order = 0;
  const nextOrder = (): number => order++;

  let tables: LayoutBlock[] = [];
  let consumed: ReadonlySet<string> = new Set<string>();
  if (options.detectTables && options.mode !== 'plain-text') {
    const result = detectTables(page.segments, page.spans, page.index, nextOrder);
    tables = result.tables;
    consumed = result.consumedSpanIds;
    for (const table of result.tables) {
      if (table.kind === 'table' && table.meta.confidence < 0.6) {
        warnings.push({
          code: 'low-confidence-table',
          pageIndex: page.index,
          message: `第 ${page.index + 1} 页有一张表格框线不完整（完整度 ${(table.meta.confidence * 100).toFixed(0)}%），行列可能不准`,
        });
      }
    }
  }

  const flowLines = bodyLines.filter((line) => !line.spanIds.every((id) => consumed.has(id)));
  const { regions, columnCount, confidence } = options.detectColumns
    ? segmentRegions(flowLines, page.width)
    : segmentRegions(flowLines, page.width, Number.POSITIVE_INFINITY);

  const ctx = { pageIndex: page.index, bodyFontSize, order };
  const blocks: LayoutBlock[] = [];
  for (const region of regions) blocks.push(...buildBlocksForRegion(region, ctx));
  order = ctx.order;

  for (const table of tables) insertByPosition(blocks, table);

  if (options.extractImages && options.mode !== 'plain-text') {
    for (const imageBlock of buildImageBlocks(page, images, tables, nextOrder)) {
      insertByPosition(blocks, imageBlock);
    }
  }

  blocks.forEach((block, i) => {
    (block.meta as { readingOrder: number }).readingOrder = i;
  });

  if (confidence < 0.6) {
    warnings.push({
      code: 'low-confidence-reading-order',
      pageIndex: page.index,
      message: `第 ${page.index + 1} 页分栏判断把握不大（栏数 ${columnCount}），建议核对阅读顺序`,
    });
  }
  if (page.ocrApplied) {
    warnings.push({
      code: 'ocr-applied',
      pageIndex: page.index,
      message: `第 ${page.index + 1} 页文字来自 OCR，存在识别误差`,
    });
  }
  if (blocks.length === 0 && page.spans.length === 0) {
    warnings.push({
      code: 'no-text-found',
      pageIndex: page.index,
      message: `第 ${page.index + 1} 页没有提取到任何文字`,
    });
  }

  return {
    index: page.index,
    width: page.width,
    height: page.height,
    margins: computeMargins(blocks, page.width, page.height),
    columnCount,
    blocks,
    header: headerLines.length > 0 ? makeHeaderFooter('header', headerLines, page.index) : null,
    footer: footerLines.length > 0 ? makeHeaderFooter('footer', footerLines, page.index) : null,
    confidence,
    warnings,
  };
}

function makeHeaderFooter(
  kind: 'header' | 'footer',
  lines: readonly TextLine[],
  pageIndex: number,
): LayoutBlock & { kind: 'header' | 'footer' } {
  return {
    kind,
    meta: {
      pageIndex,
      bbox: unionBBox(lines.map((l) => l.bbox)),
      readingOrder: -1,
      confidence: 1,
      sourceElementIds: lines.flatMap((l) => l.spanIds),
    },
    lines: [...lines],
  };
}

/** 把表格 / 图片插到第一个"位置在它之后且横向有交集"的块之前 */
function insertByPosition(blocks: LayoutBlock[], item: LayoutBlock): void {
  const idx = blocks.findIndex((block) => {
    if (block.meta.bbox.y < item.meta.bbox.y) return false;
    return (
      overlapRatio1D(
        block.meta.bbox.x,
        right(block.meta.bbox),
        item.meta.bbox.x,
        right(item.meta.bbox),
      ) > 0.1
    );
  });
  if (idx < 0) blocks.push(item);
  else blocks.splice(idx, 0, item);
}

function buildImageBlocks(
  page: PrimitivePage,
  images: ImageStore,
  tables: readonly LayoutBlock[],
  nextOrder: () => number,
): ImageBlock[] {
  const out: ImageBlock[] = [];
  for (const image of page.images) {
    const stored = images.get(image.id);
    if (!stored) continue;
    if (image.bbox.width < 8 || image.bbox.height < 8) continue;
    // 扫描页整页图已经被 OCR 成文字，再插一张原图只会重复
    if (page.ocrApplied && image.bbox.width > page.width * 0.85) continue;
    if (tables.some((t) => contains(t.meta.bbox, image.bbox, 2))) continue;

    out.push({
      kind: 'image',
      meta: {
        pageIndex: page.index,
        bbox: image.bbox,
        readingOrder: nextOrder(),
        confidence: 1,
        sourceElementIds: [image.id],
      },
      data: stored.data,
      widthPt: stored.widthPt,
      heightPt: stored.heightPt,
    });
  }
  return out;
}

function computeMargins(
  blocks: readonly LayoutBlock[],
  width: number,
  height: number,
): { top: number; right: number; bottom: number; left: number } {
  if (blocks.length === 0) {
    return { top: 72, right: 72, bottom: 72, left: 72 };
  }
  const box = unionBBox(blocks.map((b) => b.meta.bbox));
  const clamp = (v: number): number => Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, Math.round(v)));
  return {
    top: clamp(box.y),
    left: clamp(box.x),
    right: clamp(width - right(box)),
    bottom: clamp(height - bottom(box)),
  };
}
