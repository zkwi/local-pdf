import type { ConversionWarning } from '../contracts/layout.ts';
import type { ConvertOptions } from '../contracts/options.ts';
import type { PrimitiveDocument, PrimitivePage } from '../contracts/primitives.ts';
import type {
  ConversionProgress,
  ConversionReport,
  ConversionResult,
  PageReport,
} from '../contracts/report.ts';
import { writeDocx } from '../docx/writer.ts';
import type { ExtractedImage } from '../layout/analyze.ts';
import { analyzeDocument } from '../layout/analyze.ts';
import { createTesseractEngine } from '../ocr/tesseract.ts';
import type { OcrEngine } from '../ocr/engine.ts';
import { mergeOcrSpans, shouldRunOcr } from '../ocr/engine.ts';
import { computeTextHealth, describeError, PdfSession } from '../pdf/extractor.ts';
import { cropToPng } from '../pdf/images.ts';
import { buildSemanticDocument } from '../semantic/build.ts';

/** 单份文档累计的图片字节上限，超过就停止抽图 */
const MAX_TOTAL_IMAGE_BYTES = 80 * 1024 * 1024;

export class CancelledError extends Error {
  constructor() {
    super('转换已取消');
    this.name = 'CancelledError';
  }
}

export interface ConvertInput {
  readonly data: ArrayBuffer;
  readonly fileName: string;
  readonly options: ConvertOptions;
  /** 静态资源根，形如 https://host/app/ */
  readonly assetBase: string;
}

export interface ConvertCallbacks {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ConversionProgress) => void;
}

export async function convert(
  input: ConvertInput,
  callbacks: ConvertCallbacks = {},
): Promise<ConversionResult> {
  const started = now();
  const durations: Record<string, number> = {};
  const warnings: ConversionWarning[] = [];
  const { options } = input;

  const check = (): void => {
    if (callbacks.signal?.aborted === true) throw new CancelledError();
  };
  const report = (progress: ConversionProgress): void => {
    callbacks.onProgress?.(progress);
  };

  report({ stage: 'loading', fraction: 0.01, message: '正在解析 PDF…' });
  let stageStart = now();

  const session = await PdfSession.open(input.data, input.fileName, {
    password: options.password,
    assetBase: input.assetBase,
  });
  durations.loading = now() - stageStart;

  let ocrEngine: OcrEngine | null = null;
  try {
    check();
    const totalPages = Math.min(session.pageCount, Math.max(1, options.maxPages));
    if (session.pageCount > totalPages) {
      warnings.push({
        code: 'page-limit-exceeded',
        message: `文档共 ${session.pageCount} 页，按设置只转换前 ${totalPages} 页`,
      });
    }

    stageStart = now();
    const pages: PrimitivePage[] = [];
    const images = new Map<string, ExtractedImage>();
    let imageBytes = 0;

    for (let i = 0; i < totalPages; i++) {
      check();
      report({
        stage: 'extracting',
        pageIndex: i,
        totalPages,
        fraction: 0.05 + (0.65 * i) / totalPages,
        message: `正在读取第 ${i + 1} / ${totalPages} 页`,
      });

      let page: PrimitivePage;
      try {
        page = await session.extractPage(i);
      } catch (error) {
        warnings.push({
          code: 'page-extract-failed',
          pageIndex: i,
          message: `第 ${i + 1} 页解析失败，已跳过：${describeError(error)}`,
        });
        continue;
      }

      const needsOcr = shouldRunOcr(page, options.ocr);
      const needsRender =
        needsOcr || (options.extractImages && options.mode !== 'plain-text' && page.images.length > 0);

      if (needsRender) {
        const rendered = await session.renderPage(i, options.renderScale);
        if (rendered !== null) {
          if (needsOcr) {
            report({
              stage: 'ocr',
              pageIndex: i,
              totalPages,
              fraction: 0.05 + (0.65 * (i + 0.4)) / totalPages,
              message: `第 ${i + 1} 页看起来是扫描件，正在 OCR…`,
            });
            try {
              ocrEngine ??= await createTesseractEngine({
                languages: options.ocrLanguages,
                assetBase: options.ocrAssetBase,
              });
              const ocrSpans = await ocrEngine.recognize(rendered.canvas, rendered.scale, i);
              const merged = mergeOcrSpans(page.spans, ocrSpans);
              page = {
                ...page,
                spans: merged,
                ocrApplied: true,
                textHealth: computeTextHealth(merged, page.images, page.width, page.height),
              };
            } catch (error) {
              warnings.push({
                code: 'ocr-failed',
                pageIndex: i,
                message: `第 ${i + 1} 页 OCR 失败：${describeError(error)}`,
              });
            }
          }

          if (options.extractImages && options.mode !== 'plain-text') {
            for (const image of page.images) {
              if (imageBytes >= MAX_TOTAL_IMAGE_BYTES) break;
              try {
                const cropped = await cropToPng(rendered.canvas, image.bbox, rendered.scale);
                if (cropped !== null) {
                  images.set(image.id, cropped);
                  imageBytes += cropped.data.byteLength;
                }
              } catch (error) {
                warnings.push({
                  code: 'image-extract-failed',
                  pageIndex: i,
                  message: `第 ${i + 1} 页有图片抽取失败：${describeError(error)}`,
                });
              }
            }
          }

          rendered.canvas.width = 0;
          rendered.canvas.height = 0;
        } else if (needsOcr) {
          warnings.push({
            code: 'ocr-skipped',
            pageIndex: i,
            message: `第 ${i + 1} 页需要 OCR，但页面渲染失败，已跳过`,
          });
        }
      }

      pages.push(page);
      session.releasePage(i);
    }
    durations.extracting = now() - stageStart;

    check();
    report({ stage: 'analyzing', fraction: 0.72, message: '正在分析版面…' });
    stageStart = now();

    const primitive: PrimitiveDocument = {
      metadata: { ...session.metadata, pageCount: pages.length },
      pages,
    };
    const layout = analyzeDocument(primitive, images, options);
    const semantic = buildSemanticDocument(layout, primitive.metadata, options);
    durations.analyzing = now() - stageStart;

    check();
    report({ stage: 'writing', fraction: 0.88, message: '正在生成 Word 文件…' });
    stageStart = now();
    const blob = await writeDocx(semantic);
    durations.writing = now() - stageStart;

    const allWarnings = [...warnings, ...session.warnings, ...semantic.warnings];
    const result: ConversionResult = {
      blob,
      fileName: toDocxName(input.fileName),
      report: buildReport(input.fileName, layout, allWarnings, durations, now() - started),
    };

    report({ stage: 'completed', fraction: 1, message: '转换完成' });
    return result;
  } finally {
    await ocrEngine?.terminate().catch(() => undefined);
    await session.destroy().catch(() => undefined);
  }
}

function buildReport(
  fileName: string,
  layout: ReturnType<typeof analyzeDocument>,
  warnings: readonly ConversionWarning[],
  durations: Record<string, number>,
  total: number,
): ConversionReport {
  const pages: PageReport[] = layout.pages.map((page) => {
    let paragraphs = 0;
    let headings = 0;
    let listItems = 0;
    let tables = 0;
    let imagesCount = 0;
    let characters = 0;

    for (const block of page.blocks) {
      switch (block.kind) {
        case 'paragraph':
          paragraphs++;
          characters += block.lines.reduce((s, l) => s + l.text.length, 0);
          break;
        case 'heading':
          headings++;
          characters += block.lines.reduce((s, l) => s + l.text.length, 0);
          break;
        case 'list-item':
          listItems++;
          characters += block.lines.reduce((s, l) => s + l.text.length, 0);
          break;
        case 'table':
          tables++;
          characters += block.cells.reduce(
            (s, c) => s + c.lines.reduce((t, l) => t + l.text.length, 0),
            0,
          );
          break;
        case 'image':
          imagesCount++;
          break;
        case 'header':
        case 'footer':
          break;
      }
    }

    return {
      index: page.index,
      confidence: page.confidence,
      columnCount: page.columnCount,
      paragraphs,
      headings,
      listItems,
      tables,
      images: imagesCount,
      characters,
      ocrApplied: page.warnings.some((w) => w.code === 'ocr-applied'),
      warnings: page.warnings,
    };
  });

  return {
    fileName,
    pageCount: layout.pages.length,
    pages,
    warnings: warnings.filter((w) => w.pageIndex === undefined),
    durationByStage: durations,
    totalDurationMs: total,
  };
}

export function toDocxName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  return `${base || 'document'}.docx`;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
