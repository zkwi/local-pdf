import type {
  ConversionWarning,
  ImageBlock,
  ImageFormat,
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
import type { ColumnGutter } from './lines.ts';
import { segmentRegions } from './regions.ts';
import { detectRowRuledTables } from './row-tables.ts';
import { detectTables } from './tables.ts';
import { dominantFontSize, isScanWithTextLayer } from '../ocr/engine.ts';

export interface ExtractedImage {
  readonly data: Uint8Array;
  readonly format: ImageFormat;
  readonly widthPt: number;
  readonly heightPt: number;
}

/** 短边小于这个值（pt）的图当作装饰性碎片，不裁不输出 */
export const MIN_IMAGE_SIDE = 12;

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

  // 只有实际裁出并保留的扫描区域才去掉重复文字；裁图失败时仍保留文字层。
  const textPages = doc.pages.map((page) => {
    const kept =
      options.extractImages && options.mode !== 'plain-text'
        ? scanImageFallbacks(page, images)
        : [];
    if (kept.length === 0) return page;
    return {
      ...page,
      spans: page.spans.filter(
        (span) =>
          !kept.some((image) => {
            const x = span.bbox.x + span.bbox.width / 2;
            const y = span.bbox.y + span.bbox.height / 2;
            return (
              x >= image.bbox.x &&
              x <= right(image.bbox) &&
              y >= image.bbox.y &&
              y <= bottom(image.bbox)
            );
          }),
      ),
    };
  });

  const pageLines = textPages.map((page) => {
    const built = buildLines(page.spans, page.width);
    // 一两个竖排片段多半是水印、二维码旁的装饰字，不值得打扰用户
    if (built.verticalSpanCount >= 3) {
      warnings.push({
        code: 'vertical-text-flattened',
        pageIndex: page.index,
        params: { page: page.index + 1 },
      });
    }
    return {
      index: page.index,
      width: page.width,
      height: page.height,
      lines: built.lines,
      gutters: built.gutters,
    };
  });

  const headerFooter = options.detectHeaderFooter
    ? detectHeadersFooters(pageLines)
    : { headerLineIds: new Map(), footerLineIds: new Map() };

  // 旋转文字被拉平进正文才值得提醒；归入页眉的侧边章节名不算
  for (const page of pageLines) {
    const header = headerFooter.headerLineIds.get(page.index);
    const count = page.lines.filter(
      (l) =>
        l.spans.length === 1 &&
        !l.spans[0].vertical &&
        l.spans[0].rotation >= 1 &&
        l.spans[0].rotation <= 359 &&
        header?.has(l.id) !== true,
    ).length;
    if (count > 0) {
      warnings.push({
        code: 'rotated-text-flattened',
        pageIndex: page.index,
        params: { page: page.index + 1, count },
      });
    }
  }

  const pages = doc.pages.map((page, i) =>
    analyzePage(
      page,
      pageLines[i].lines,
      pageLines[i].gutters,
      headerFooter.headerLineIds.get(page.index) ?? new Set<string>(),
      headerFooter.footerLineIds.get(page.index) ?? new Set<string>(),
      images,
      options,
      bodyFontSize,
      textPages[i].spans,
    ),
  );

  return { pages, warnings, bodyFontSize };
}

/** 原生文字至少有这么多字，正文字号才只看原生页 */
const MIN_NATIVE_SAMPLE = 300;
/** 一个字号至少有这么多条长行，才算本页成片正文的字号 */
const MIN_TEXT_LINES = 3;
const LONG_LINE_CHARS = 15;

/** OCR 页上成片正文用到的字号：至少三条长行共用的字号（表格里的短行不算） */
function runningTextSizes(lines: readonly TextLine[]): number[] {
  const counts = new Map<number, number>();
  for (const line of lines) {
    if (line.text.trim().length < LONG_LINE_CHARS) continue;
    const key = Math.round(line.fontSize * 2) / 2;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= MIN_TEXT_LINES).map(([size]) => size);
}

/**
 * 正文字号：按字数加权的众数。原生文字页优先——OCR 页（自己识别的或自带文字层的）
 * 的字号已经吸附成一个值，只要字数多一点就会把众数拉到它那边，原生正文的 10.5 / 11 / 12
 * 分散在几个桶里反而输掉，结果整份文档的正文都被当成标题。
 */
function estimateBodyFontSize(doc: PrimitiveDocument): number {
  const native = doc.pages.filter((p) => !p.ocrApplied && !p.textHealth.hiddenText);
  const nativeSizes = collectSizes(native);
  const sizes = nativeSizes.length >= MIN_NATIVE_SAMPLE ? nativeSizes : collectSizes(doc.pages);
  const value = mode(sizes, 0.5);
  return value > 0 ? value : 10.5;
}

function collectSizes(pages: readonly PrimitivePage[]): number[] {
  const sizes: number[] = [];
  for (const page of pages) {
    for (const span of page.spans) {
      const weight = Math.min(40, span.text.trim().length);
      for (let i = 0; i < weight; i++) sizes.push(span.fontSize);
    }
  }
  return sizes;
}

function analyzePage(
  page: PrimitivePage,
  allLines: readonly TextLine[],
  gutters: readonly ColumnGutter[],
  headerIds: ReadonlySet<string>,
  footerIds: ReadonlySet<string>,
  images: ImageStore,
  options: ConvertOptions,
  bodyFontSize: number,
  tableSpans = page.spans,
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
    const result = detectTables(page.segments, tableSpans, page.index, nextOrder);
    // 有框线的先认；剩下的文字再看有没有"只有横线"的表（三线表、对账单）
    const consumedSet = new Set(result.consumedSpanIds);
    const rowTables = detectRowRuledTables(
      page.segments,
      tableSpans,
      page.index,
      nextOrder,
      consumedSet,
    );
    tables = [...result.tables, ...rowTables];
    consumed = consumedSet;
    for (const table of tables) {
      if (table.kind === 'table' && table.meta.confidence < 0.6) {
        warnings.push({
          code: 'low-confidence-table',
          pageIndex: page.index,
          params: { page: page.index + 1, percent: (table.meta.confidence * 100).toFixed(0) },
        });
      }
    }
  }

  const flowLines = bodyLines.filter((line) => !line.spanIds.every((id) => consumed.has(id)));
  const {
    regions,
    columnCount,
    confidence: readingConfidence,
  } = options.detectColumns
    ? segmentRegions(flowLines, page.width, undefined, gutters)
    : segmentRegions(flowLines, page.width, Number.POSITIVE_INFINITY);
  const scan = page.ocrApplied || isScanWithTextLayer(page);
  const confidence = scan ? Math.min(readingConfidence, 0.59) : readingConfidence;
  if (scan) {
    const kept =
      options.extractImages && options.mode !== 'plain-text'
        ? scanImageFallbacks(page, images)
        : [];
    warnings.push({
      code: kept.length > 0 ? 'scan-image-fallback' : 'scan-layout-review',
      pageIndex: page.index,
      params: { page: page.index + 1 },
    });
  }

  const noisy = page.textHealth.hiddenText || page.ocrApplied;
  // OCR 页各页的正文字号本来就不一样（通知正文 16 号，附表 10 号），标题阈值按本页自己的正文算；
  // 取大者是为了让夹在原生文档里的截图页（字很小）不把自己的小字当正文
  const pageBodyFontSize = noisy
    ? Math.max(bodyFontSize, dominantFontSize(page.spans))
    : bodyFontSize;
  const ctx = {
    pageIndex: page.index,
    bodyFontSize: pageBodyFontSize,
    order,
    noisyFontSizes: noisy,
    pageLines: flowLines,
    textSizes: noisy ? runningTextSizes(flowLines) : undefined,
  };
  const pageTextRight = Math.max(...flowLines.map((l) => right(l.bbox)));
  const blocks: LayoutBlock[] = [];
  for (const region of regions) {
    // 右边没有并排的区域（不是分栏）时，行应该排满到本页文字的右边界
    const beside = regions.some(
      (o) =>
        o !== region &&
        o.bbox.x >= right(region.bbox) - 1 &&
        overlapRatio1D(o.bbox.y, bottom(o.bbox), region.bbox.y, bottom(region.bbox)) > 0,
    );
    const regionCtx = beside ? ctx : { ...ctx, lineRight: pageTextRight };
    blocks.push(...buildBlocksForRegion(region, regionCtx));
    ctx.order = regionCtx.order;
  }
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

  if (readingConfidence < 0.6) {
    warnings.push({
      code: 'low-confidence-reading-order',
      pageIndex: page.index,
      params: { page: page.index + 1, columns: columnCount },
    });
  }
  if (page.ocrApplied) {
    warnings.push({
      code: 'ocr-applied',
      pageIndex: page.index,
      params: { page: page.index + 1 },
    });
  }
  if (blocks.length === 0 && page.spans.length === 0) {
    warnings.push({
      code: 'no-text-found',
      pageIndex: page.index,
      params: { page: page.index + 1 },
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

/** 宽高都覆盖页面才算整页图；长图中的横向图表和扫描分片不能丢掉。 */
export function isFullPageImage(
  image: { readonly bbox: { readonly width: number; readonly height: number } },
  page: { readonly width: number; readonly height: number },
): boolean {
  return image.bbox.width > page.width * 0.85 && image.bbox.height > page.height * 0.85;
}

function scanImageFallbacks(page: PrimitivePage, images: ImageStore) {
  if (!(page.ocrApplied || isScanWithTextLayer(page))) return [];
  return page.images.filter(
    (image) =>
      images.has(image.id) &&
      !isFullPageImage(image, page) &&
      image.bbox.width >= MIN_IMAGE_SIDE &&
      image.bbox.height >= MIN_IMAGE_SIDE,
  );
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
    if (image.bbox.width < MIN_IMAGE_SIDE || image.bbox.height < MIN_IMAGE_SIDE) continue;
    // 扫描页整页图已经被 OCR 成文字（或自带的文字层就是它的识别结果），再插一张原图只会重复
    if ((page.ocrApplied || isScanWithTextLayer(page)) && isFullPageImage(image, page)) continue;
    if (
      !(page.ocrApplied || isScanWithTextLayer(page)) &&
      tables.some((t) => contains(t.meta.bbox, image.bbox, 2))
    )
      continue;

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
      format: stored.format,
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
  // 整页图（扫描页、背景图）贴着纸边，不能拿它算页边距；只有它时才用
  const framing = blocks.filter(
    (b) => !(b.kind === 'image' && isFullPageImage({ bbox: b.meta.bbox }, { width, height })),
  );
  const measured = framing.length > 0 ? framing : blocks;
  if (measured.length === 0) {
    return { top: 72, right: 72, bottom: 72, left: 72 };
  }
  const box = unionBBox(measured.map((b) => b.meta.bbox));
  const clamp = (v: number): number => Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, Math.round(v)));
  return {
    top: clamp(box.y),
    left: clamp(box.x),
    right: clamp(width - right(box)),
    bottom: clamp(height - bottom(box)),
  };
}
