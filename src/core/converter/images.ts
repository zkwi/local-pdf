import { zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import type { ConversionWarning } from '../contracts/layout.ts';
import type { ConvertOptions, PageImageFormat } from '../contracts/options.ts';
import type {
  ConversionOutput,
  ConversionProgress,
  ConversionReport,
  PageReport,
} from '../contracts/report.ts';
import type { PdfSession } from '../pdf/extractor.ts';

const JPEG_QUALITY = 0.9;
const MIME: Record<PageImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg' };
const EXTENSION: Record<PageImageFormat, string> = { png: 'png', jpeg: 'jpg' };

export interface PageImage {
  readonly index: number;
  readonly data: Uint8Array;
}

/** PDF 的坐标单位是 1/72 英寸，DPI 除以 72 就是 pdf.js 的渲染倍率 */
export function dpiToScale(dpi: number): number {
  return Math.max(0.5, dpi / 72);
}

/** 页码补零到总页数的位数，文件管理器按名字排序就是页序 */
export function pageImageName(
  baseName: string,
  index: number,
  totalPages: number,
  format: PageImageFormat,
): string {
  const digits = Math.max(2, String(totalPages).length);
  return `${baseName}-${String(index + 1).padStart(digits, '0')}.${EXTENSION[format]}`;
}

/**
 * 只有一张图就直接给图片文件（从多页文档里只挑了一页时文件名带页码），多张打成 zip。
 * PNG / JPEG 本身已经压过，zip 里只存储不压缩。
 */
export function packPageImages(
  images: readonly PageImage[],
  totalPages: number,
  baseName: string,
  format: PageImageFormat,
): ConversionOutput {
  if (images.length === 1) {
    const only = images[0];
    return {
      kind: 'image',
      blob: new Blob([only.data as BlobPart], { type: MIME[format] }),
      fileName:
        totalPages === 1
          ? `${baseName}.${EXTENSION[format]}`
          : pageImageName(baseName, only.index, totalPages, format),
    };
  }
  const files: Zippable = {};
  for (const image of images) {
    files[pageImageName(baseName, image.index, totalPages, format)] = [image.data, { level: 0 }];
  }
  return {
    kind: 'image-bundle',
    blob: new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }),
    fileName: `${baseName}.images.zip`,
  };
}

export interface RenderCallbacks {
  /** 取消了就抛 */
  readonly check: () => void;
  readonly report: (progress: ConversionProgress) => void;
}

/**
 * PDF 转图片：把 pageIndices 里的页逐页渲染、编码，不经过文字抽取和版面分析。
 * 渲染失败的页跳过（PdfSession 已记了 page-render-failed），一页都没成功才算失败。
 * 进度里的 pageIndex / totalPages 是"第几张 / 共几张"，剩余时间估算按张数走。
 */
export async function renderPageImages(
  session: PdfSession,
  pageIndices: readonly number[],
  options: ConvertOptions,
  callbacks: RenderCallbacks,
): Promise<PageImage[]> {
  const format = options.pageImageFormat;
  const scale = dpiToScale(options.pageImageDpi);
  const encode: ImageEncodeOptions =
    format === 'jpeg' ? { type: MIME.jpeg, quality: JPEG_QUALITY } : { type: MIME.png };
  const images: PageImage[] = [];
  const total = pageIndices.length;

  for (const [k, i] of pageIndices.entries()) {
    callbacks.check();
    callbacks.report({
      stage: 'rendering',
      pageIndex: k,
      totalPages: total,
      documentPages: session.pageCount,
      fraction: 0.05 + (0.85 * k) / total,
      key: 'rendering',
      params: { page: i + 1, total: session.pageCount },
    });
    const rendered = await session.renderPage(i, scale);
    session.releasePage(i);
    if (rendered === null) continue;
    const blob = await rendered.canvas.convertToBlob(encode);
    rendered.canvas.width = 0;
    rendered.canvas.height = 0;
    images.push({ index: i, data: new Uint8Array(await blob.arrayBuffer()) });
  }

  if (images.length === 0) throw new Error('no page could be rendered');
  return images;
}

/** 图片模式的报告：每页一张图，没有文字统计；警告按页归位，没渲染出来的页归到文档级 */
export function buildImageReport(
  fileName: string,
  images: readonly PageImage[],
  warnings: readonly ConversionWarning[],
  durations: Readonly<Record<string, number>>,
  totalDurationMs: number,
): ConversionReport {
  const pages: PageReport[] = images.map((image) => ({
    index: image.index,
    confidence: 1,
    columnCount: 0,
    paragraphs: 0,
    headings: 0,
    listItems: 0,
    tables: 0,
    images: 1,
    characters: 0,
    ocrApplied: false,
    warnings: warnings.filter((w) => w.pageIndex === image.index),
  }));
  const rendered = new Set(images.map((image) => image.index));
  return {
    fileName,
    pageCount: pages.length,
    pages,
    warnings: warnings.filter((w) => w.pageIndex === undefined || !rendered.has(w.pageIndex)),
    durationByStage: durations,
    totalDurationMs,
  };
}
