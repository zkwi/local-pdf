import type { ConversionWarning } from '../contracts/layout.ts';
import type { ConvertOptions } from '../contracts/options.ts';
import type {
  PrimitiveDocument,
  PrimitivePage,
  PrimitiveTextSpan,
} from '../contracts/primitives.ts';
import type {
  ConversionOutput,
  ConversionProgress,
  ConversionReport,
  ConversionResult,
  PageReport,
} from '../contracts/report.ts';
import { writeDocx } from '../docx/writer.ts';
import type { ExtractedImage } from '../layout/analyze.ts';
import { analyzeDocument, MIN_IMAGE_SIDE } from '../layout/analyze.ts';
import { createOcrEngine } from '../ocr/create.ts';
import type { OcrEngine } from '../ocr/engine.ts';
import { isSparseOcr, mergeOcrSpans, shouldRunOcr } from '../ocr/engine.ts';
import { mergeStripSpans, planStrips, STRIP_THRESHOLD_PT } from '../ocr/strips.ts';
import type { StripResult } from '../ocr/strips.ts';
import { computeTextHealth, describeError, PdfSession } from '../pdf/extractor.ts';
import { cropToPng } from '../pdf/images.ts';
import { buildSemanticDocument } from '../semantic/build.ts';

/** 单份文档累计的图片字节上限，超过就停止抽图 */
const MAX_TOTAL_IMAGE_BYTES = 80 * 1024 * 1024;

/** OCR 至少按这个倍率渲染（72 pt × 3 ≈ 216 DPI），低于这个小字号识别率掉得厉害 */
const MIN_OCR_SCALE = 3;

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
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

  report({ stage: 'loading', fraction: 0.01, key: 'loading' });
  let stageStart = now();

  const session = await PdfSession.open(input.data, input.fileName, {
    password: options.password,
    assetBase: input.assetBase,
  });
  durations.loading = now() - stageStart;

  // 放在对象里而不是 let：赋值发生在闭包内，TS 的流程分析会把裸变量一直当成 null
  const ocr: { engine: OcrEngine | null } = { engine: null };
  try {
    check();
    const totalPages = Math.min(session.pageCount, Math.max(1, options.maxPages));
    if (session.pageCount > totalPages) {
      warnings.push({
        code: 'page-limit-exceeded',
        params: { total: session.pageCount, limit: totalPages },
      });
    }

    /** 第一次需要 OCR 时才创建引擎；模型下载进度挂在当前页的进度区间里 */
    const obtainOcrEngine = async (pageIndex: number): Promise<OcrEngine> => {
      if (ocr.engine !== null) return ocr.engine;
      const modelStart = now();
      const created = await createOcrEngine(options, {
        assetBase: input.assetBase,
        signal: callbacks.signal,
        onProgress: (p) => {
          report({
            stage: 'ocr-model',
            pageIndex,
            totalPages,
            fraction:
              0.05 + (0.65 * (pageIndex + 0.15 + Math.max(0, p.progress) * 0.25)) / totalPages,
            key: p.key,
            params: p.params,
          });
        },
      });
      durations['ocr-model'] = now() - modelStart;
      warnings.push(...created.warnings);
      ocr.engine = created.engine;
      return ocr.engine;
    };

    stageStart = now();
    const pages: PrimitivePage[] = [];
    const images = new Map<string, ExtractedImage>();
    let imageBytes = 0;
    let ocrTotal = 0;

    for (let i = 0; i < totalPages; i++) {
      check();
      report({
        stage: 'extracting',
        pageIndex: i,
        totalPages,
        fraction: 0.05 + (0.65 * i) / totalPages,
        key: 'extracting',
        params: { page: i + 1, total: totalPages },
      });

      let page: PrimitivePage;
      try {
        page = await session.extractPage(i);
      } catch (error) {
        warnings.push({
          code: 'page-extract-failed',
          pageIndex: i,
          params: { page: i + 1, reason: describeError(error) },
        });
        continue;
      }

      const needsOcr = shouldRunOcr(page, options.ocr);
      const wantImages =
        options.extractImages && options.mode !== 'plain-text' && page.images.length > 0;

      if (needsOcr || wantImages) {
        const scale = needsOcr ? Math.max(options.renderScale, MIN_OCR_SCALE) : options.renderScale;
        const rendered = await session.renderPage(i, scale);
        if (rendered !== null) {
          if (needsOcr) {
            try {
              const engine = await obtainOcrEngine(i);
              check();
              report({
                stage: 'ocr',
                pageIndex: i,
                totalPages,
                fraction: 0.05 + (0.65 * (i + 0.45)) / totalPages,
                key: 'ocr',
                params: { page: i + 1 },
              });
              const ocrStart = now();
              const ocrSpans =
                page.height > STRIP_THRESHOLD_PT
                  ? await recognizeInStrips(session, engine, i, page.height, scale)
                  : await engine.recognize(rendered.canvas, rendered.scale, i);
              ocrTotal += now() - ocrStart;
              // 自动模式下，整版图表/封面上认出的零星标签不当正文，保留原图
              if (options.ocr === 'auto' && isSparseOcr(ocrSpans)) {
                warnings.push({
                  code: 'ocr-sparse-kept-image',
                  pageIndex: i,
                  params: {
                    page: i + 1,
                    count: ocrSpans.reduce((s, sp) => s + sp.text.length, 0),
                  },
                });
              } else {
                const merged = mergeOcrSpans(page.spans, ocrSpans);
                page = {
                  ...page,
                  spans: merged,
                  ocrApplied: true,
                  textHealth: computeTextHealth(merged, page.images, page.width, page.height),
                };
              }
            } catch (error) {
              if (error instanceof CancelledError || callbacks.signal?.aborted === true)
                throw error;
              warnings.push({
                code: 'ocr-failed',
                pageIndex: i,
                params: { page: i + 1, reason: describeError(error) },
              });
            }
          }

          if (wantImages) {
            for (const image of page.images) {
              if (imageBytes >= MAX_TOTAL_IMAGE_BYTES) break;
              if (image.bbox.width < MIN_IMAGE_SIDE || image.bbox.height < MIN_IMAGE_SIDE) continue;
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
                  params: { page: i + 1, reason: describeError(error) },
                });
              }
            }
          }

          rendered.canvas.width = 0;
          rendered.canvas.height = 0;
        } else if (needsOcr) {
          warnings.push({ code: 'ocr-skipped', pageIndex: i, params: { page: i + 1 } });
        }
      }

      pages.push(page);
      session.releasePage(i);
    }
    durations.extracting = now() - stageStart - ocrTotal - (durations['ocr-model'] ?? 0);
    if (ocrTotal > 0) durations.ocr = ocrTotal;

    check();
    report({ stage: 'analyzing', fraction: 0.72, key: 'analyzing' });
    stageStart = now();

    const primitive: PrimitiveDocument = {
      metadata: { ...session.metadata, pageCount: pages.length },
      pages,
    };
    const layout = analyzeDocument(primitive, images, options);
    const semantic = buildSemanticDocument(layout, primitive.metadata, options);
    durations.analyzing = now() - stageStart;

    check();
    stageStart = now();
    const outputs: ConversionOutput[] = [];
    const baseName = safeBaseName(input.fileName);

    if (options.output === 'docx' || options.output === 'both') {
      report({ stage: 'writing', fraction: 0.86, key: 'writing-docx' });
      outputs.push({ kind: 'docx', blob: await writeDocx(semantic), fileName: `${baseName}.docx` });
    }
    if (options.output === 'markdown' || options.output === 'both') {
      check();
      report({ stage: 'writing', fraction: 0.93, key: 'writing-markdown' });
      const [{ writeMarkdown }, { packMarkdown }] = await Promise.all([
        import('../markdown/writer.ts'),
        import('../markdown/bundle.ts'),
      ]);
      const bundle = await writeMarkdown(semantic, options.locale);
      warnings.push(...bundle.warnings);
      outputs.push(packMarkdown(bundle, baseName));
    }
    durations.writing = now() - stageStart;

    const allWarnings = [...warnings, ...session.warnings, ...semantic.warnings];
    const result: ConversionResult = {
      outputs,
      report: buildReport(
        input.fileName,
        layout,
        allWarnings,
        durations,
        now() - started,
        ocr.engine?.name,
      ),
    };

    report({ stage: 'completed', fraction: 1, key: 'completed' });
    return result;
  } finally {
    await ocr.engine?.terminate().catch(() => undefined);
    await session.destroy().catch(() => undefined);
  }
}

/**
 * 长图页分条 OCR：整页按 3× 渲染会撞像素上限被缩小，文字就认不出了。
 * 每条单独渲染、识别，再换算回页面坐标并去重。
 */
async function recognizeInStrips(
  session: PdfSession,
  engine: OcrEngine,
  pageIndex: number,
  pageHeight: number,
  scale: number,
): Promise<PrimitiveTextSpan[]> {
  const results: StripResult[] = [];
  for (const plan of planStrips(pageHeight)) {
    const strip = await session.renderStrip(pageIndex, scale, plan.top, plan.height);
    if (strip === null) continue;
    const spans = await engine.recognize(strip.canvas, strip.scale, pageIndex);
    strip.canvas.width = 0;
    strip.canvas.height = 0;
    results.push({ plan, spans });
  }
  return mergeStripSpans(results, pageHeight, pageIndex);
}

/**
 * 汇总报告。输入是转换期、pdf 会话、版面/语义三处的全部警告，
 * 按页归到 PageReport，没有页码的留在文档级；同一条不重复出现。
 */
function buildReport(
  fileName: string,
  layout: ReturnType<typeof analyzeDocument>,
  rawWarnings: readonly ConversionWarning[],
  durations: Record<string, number>,
  total: number,
  ocrEngine: string | undefined,
): ConversionReport {
  const seen = new Set<string>();
  const warnings = rawWarnings.filter((w) => {
    const key = `${w.code}|${w.pageIndex ?? ''}|${JSON.stringify(w.params ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const pages: PageReport[] = layout.pages.map((page) => {
    const pageWarnings = warnings.filter((w) => w.pageIndex === page.index);
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
      ocrApplied: pageWarnings.some((w) => w.code === 'ocr-applied'),
      warnings: pageWarnings,
    };
  });

  return {
    fileName,
    pageCount: layout.pages.length,
    pages,
    warnings: warnings.filter(
      (w) => w.pageIndex === undefined || !layout.pages.some((p) => p.index === w.pageIndex),
    ),
    durationByStage: durations,
    totalDurationMs: total,
    ocrEngine,
  };
}

/** 去掉扩展名和文件系统不接受的字符 */
export function safeBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  return base || 'document';
}

export function toDocxName(fileName: string): string {
  return `${safeBaseName(fileName)}.docx`;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
