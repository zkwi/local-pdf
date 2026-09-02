import { Util, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist/types/src/display/api.js';
import type { BBox } from '../contracts/geometry.ts';
import type {
  DocumentMetadata,
  PrimitiveImage,
  PrimitiveLink,
  PrimitivePage,
  PrimitiveTextSpan,
  TextHealth,
} from '../contracts/primitives.ts';
import type { ConversionWarning } from '../contracts/layout.ts';
import { clusterBoxes, makeBBox, unionBBox } from '../geometry/bbox.ts';
import { snapFontSizes } from '../ocr/engine.ts';
import { sanitizeText } from '../util/sanitize.ts';
import { isSymbolFont, mapSymbolFontText } from './symbols.ts';
import { walkOperatorList } from './operators.ts';
import {
  NoopFilterFactory,
  OffscreenCanvasFactory,
  installInContextPdfWorker,
} from './pdfjs-runtime.ts';

/** pdf.js 文本项的结构（root 没有导出该类型，这里按结构声明） */
interface PdfTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

interface PdfTextStyle {
  ascent: number;
  descent: number;
  vertical: boolean;
  fontFamily: string;
}

interface FontInfo {
  name: string;
  family: string;
  bold: boolean;
  italic: boolean;
}

const BOLD_NAME = /(bold|black|heavy|semibold|demibold|[-_]bd\b)/i;
const ITALIC_NAME = /(italic|oblique|[-_]it\b)/i;

/** 整页渲染的像素上限，超过就按面积回退倍率 */
const MAX_PAGE_PIXELS = 20_000_000;

export interface RenderedPage {
  readonly canvas: OffscreenCanvas;
  readonly scale: number;
}

export interface OpenPdfOptions {
  readonly password?: string;
  /** 静态资源根（以 / 结尾），worker 里没有 document.baseURI，必须由主线程传入 */
  readonly assetBase: string;
}

export class PdfSession {
  readonly pageCount: number;
  readonly metadata: DocumentMetadata;
  readonly warnings: ConversionWarning[] = [];

  #doc: PDFDocumentProxy;
  #task: PDFDocumentLoadingTask;
  #pageCache = new Map<number, PDFPageProxy>();

  private constructor(
    doc: PDFDocumentProxy,
    task: PDFDocumentLoadingTask,
    metadata: DocumentMetadata,
  ) {
    this.#doc = doc;
    this.#task = task;
    this.pageCount = doc.numPages;
    this.metadata = metadata;
  }

  static async open(
    data: ArrayBuffer,
    fileName: string,
    options: OpenPdfOptions,
  ): Promise<PdfSession> {
    installInContextPdfWorker();
    const base = options.assetBase;
    const task = getDocument({
      data: new Uint8Array(data),
      password: options.password,
      cMapUrl: `${base}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
      wasmUrl: `${base}pdfjs/wasm/`,
      iccUrl: `${base}pdfjs/iccs/`,
      // Worker 里没有 document，必须显式给死，否则 pdf.js 会去读 document.baseURI
      useWorkerFetch: true,
      disableFontFace: true,
      useSystemFonts: false,
      enableXfa: false,
      CanvasFactory: OffscreenCanvasFactory,
      FilterFactory: NoopFilterFactory,
    });
    const doc = await task.promise;

    let info: Record<string, unknown> = {};
    try {
      const meta = await doc.getMetadata();
      info = (meta.info ?? {}) as Record<string, unknown>;
    } catch {
      /* metadata 不是必需品 */
    }

    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

    return new PdfSession(doc, task, {
      title: str(info.Title),
      author: str(info.Author),
      creator: str(info.Creator),
      producer: str(info.Producer),
      pageCount: doc.numPages,
      sourceFileName: fileName,
    });
  }

  async #getPage(index: number): Promise<PDFPageProxy> {
    const cached = this.#pageCache.get(index);
    if (cached) return cached;
    const page = await this.#doc.getPage(index + 1);
    this.#pageCache.set(index, page);
    return page;
  }

  releasePage(index: number): void {
    const page = this.#pageCache.get(index);
    if (page) {
      page.cleanup();
      this.#pageCache.delete(index);
    }
  }

  async extractPage(index: number): Promise<PrimitivePage> {
    const page = await this.#getPage(index);
    const viewport = page.getViewport({ scale: 1 });
    const transform = viewport.transform;
    const width = viewport.width;
    const height = viewport.height;

    let graphics = {
      segments: [],
      images: [],
      fontKeys: [] as string[],
      hiddenTextOps: 0,
      visibleTextOps: 0,
    } as ReturnType<typeof walkOperatorList>;
    try {
      const opList = await page.getOperatorList();
      graphics = walkOperatorList(opList, transform, index);
    } catch (error) {
      this.warnings.push({
        code: 'operator-list-failed',
        pageIndex: index,
        params: { page: index + 1, reason: describeError(error) },
      });
    }

    // 文字全部以不可见模式绘制：可搜索扫描件的文字层
    const hiddenLayer = graphics.hiddenTextOps > 0 && graphics.visibleTextOps === 0;
    const fonts = this.#collectFonts(page, graphics.fontKeys);
    const textContent = await page.getTextContent();
    const styles = textContent.styles as unknown as Record<string, PdfTextStyle>;
    const spans: PrimitiveTextSpan[] = [];
    // 健康度要看清洗前的原文：控制符、替换字符正是"文字层坏了"的信号
    let rawText = '';

    for (const raw of textContent.items) {
      const item = raw as unknown as PdfTextItem;
      if (typeof item.str !== 'string') continue;
      if (item.str === '') continue;
      rawText += item.str;
      let clean = sanitizeText(item.str);
      const fontName = fonts.get(item.fontName)?.name;
      // Wingdings/Symbol 的项目符号在私用区，Word 里没字体就是方框
      if (isSymbolFont(fontName)) clean = mapSymbolFontText(fontName ?? '', clean);
      if (clean === '') continue;
      const span = buildSpan(
        { ...item, str: clean },
        styles[item.fontName],
        fonts,
        transform,
        index,
        spans.length,
        hiddenLayer,
      );
      if (span !== null) spans.push(span);
    }

    const links = await this.#extractLinks(page, index, transform);
    const images = mergeImageTiles(graphics.images);
    // 文字层是别的 OCR 软件写的：字号按框高估的，逐行抖动，先吸附到主流字号
    const finalSpans = hiddenLayer ? snapFontSizes(spans) : spans;

    return {
      index,
      width,
      height,
      rotation: page.rotate,
      spans: finalSpans,
      images,
      segments: graphics.segments,
      links,
      textHealth: computeTextHealth(finalSpans, images, width, height, rawText, hiddenLayer),
      ocrApplied: false,
    };
  }

  #collectFonts(page: PDFPageProxy, fontKeys: readonly string[]): Map<string, FontInfo> {
    const map = new Map<string, FontInfo>();
    const objs = page.commonObjs as unknown as {
      has(id: string): boolean;
      get(id: string): unknown;
    };
    for (const key of fontKeys) {
      try {
        if (!objs.has(key)) continue;
        const font = objs.get(key) as {
          name?: string;
          fallbackName?: string;
          bold?: boolean;
          italic?: boolean;
        } | null;
        if (!font) continue;
        const name = font.name ?? key;
        map.set(key, {
          name,
          family: font.fallbackName ?? 'sans-serif',
          bold: font.bold === true || BOLD_NAME.test(name),
          italic: font.italic === true || ITALIC_NAME.test(name),
        });
      } catch {
        /* 单个字体读不到不影响整页 */
      }
    }
    return map;
  }

  async #extractLinks(
    page: PDFPageProxy,
    index: number,
    transform: readonly number[],
  ): Promise<PrimitiveLink[]> {
    try {
      const annotations = (await page.getAnnotations({ intent: 'display' })) as unknown as {
        subtype?: string;
        url?: string;
        rect?: number[];
      }[];
      const links: PrimitiveLink[] = [];
      for (const a of annotations) {
        if (a.subtype !== 'Link' || typeof a.url !== 'string' || !a.rect) continue;
        const [x0, y0] = applyPoint(transform, a.rect[0], a.rect[1]);
        const [x1, y1] = applyPoint(transform, a.rect[2], a.rect[3]);
        links.push({
          id: `p${index}-link${links.length}`,
          pageIndex: index,
          bbox: makeBBox(x0, y0, x1, y1),
          url: a.url,
        });
      }
      return links;
    } catch {
      return [];
    }
  }

  /**
   * 只渲染页面的一段（纵向 [topPt, topPt+heightPt)）。
   * 微信里的"长图"PDF 一页能有上万 pt 高，整页按 OCR 倍率渲染会撞像素上限被迫缩小，
   * 文字小到认不出；分条渲染就没这个问题。
   */
  async renderStrip(
    index: number,
    scale: number,
    topPt: number,
    heightPt: number,
  ): Promise<RenderedPage | null> {
    try {
      const page = await this.#getPage(index);
      const viewport = page.getViewport({ scale, offsetY: -topPt * scale });
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(viewport.width)),
        Math.max(1, Math.round(heightPt * scale)),
      );
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return null;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        background: '#ffffff',
      }).promise;
      return { canvas, scale };
    } catch (error) {
      this.warnings.push({
        code: 'page-render-failed',
        pageIndex: index,
        params: { page: index + 1, reason: describeError(error) },
      });
      return null;
    }
  }

  /** 把整页渲染到 OffscreenCanvas，用于图片裁剪与 OCR。失败返回 null，不阻断转换。 */
  async renderPage(index: number, requestedScale: number): Promise<RenderedPage | null> {
    try {
      const page = await this.#getPage(index);
      const base = page.getViewport({ scale: 1 });
      // A0 海报按 2× 渲染就有三千多万像素，会超浏览器的 canvas 面积上限。
      // 这里按面积回退倍率，而不是直接去创建一张超大 canvas。
      const maxScale = Math.sqrt(MAX_PAGE_PIXELS / Math.max(1, base.width * base.height));
      const scale = Math.max(0.5, Math.min(requestedScale, maxScale));
      if (scale < requestedScale - 0.01) {
        this.warnings.push({
          code: 'page-render-downscaled',
          pageIndex: index,
          params: { page: index + 1, from: requestedScale, to: scale.toFixed(2) },
        });
      }
      const viewport = page.getViewport({ scale });
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(viewport.width)),
        Math.max(1, Math.round(viewport.height)),
      );
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return null;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        background: '#ffffff',
      }).promise;
      return { canvas, scale };
    } catch (error) {
      this.warnings.push({
        code: 'page-render-failed',
        pageIndex: index,
        params: { page: index + 1, reason: describeError(error) },
      });
      return null;
    }
  }

  async destroy(): Promise<void> {
    for (const [, page] of this.#pageCache) page.cleanup();
    this.#pageCache.clear();
    await this.#task.destroy();
  }
}

function applyPoint(m: readonly number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function buildSpan(
  item: PdfTextItem,
  style: PdfTextStyle | undefined,
  fonts: Map<string, FontInfo>,
  transform: readonly number[],
  pageIndex: number,
  seq: number,
  hiddenLayer: boolean,
): PrimitiveTextSpan | null {
  const tx = Util.transform(transform, item.transform);
  const fontSize = Math.hypot(tx[2], tx[3]);
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;

  const advanceScale = Math.hypot(tx[0], tx[1]) || 1;
  const ex = { x: tx[0] / advanceScale, y: tx[1] / advanceScale };
  const ey = { x: tx[2] / fontSize, y: tx[3] / fontSize };

  const rawAscent = style?.ascent;
  const ascentRatio =
    typeof rawAscent === 'number' && rawAscent > 0 && rawAscent < 1.5 ? rawAscent : 0.8;
  const ascent = fontSize * ascentRatio;
  const descent = fontSize - ascent;
  const vertical = style?.vertical === true;

  const u0 = vertical ? -fontSize / 2 : 0;
  const u1 = vertical ? fontSize / 2 : item.width;
  const v0 = vertical ? -item.height : -descent;
  const v1 = vertical ? 0 : ascent;

  const ox = tx[4];
  const oy = tx[5];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of [u0, u1]) {
    for (const v of [v0, v1]) {
      xs.push(ox + ex.x * u + ey.x * v);
      ys.push(oy + ex.y * u + ey.y * v);
    }
  }
  const bbox: BBox = makeBBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));

  const font = fonts.get(item.fontName);
  const angle = (Math.atan2(tx[1], tx[0]) * 180) / Math.PI;
  const rotation = ((angle % 360) + 360) % 360;
  const squashed = normalizeSquashedSpan(rotation, bbox, vertical, ascentRatio, hiddenLayer);

  return {
    id: `p${pageIndex}-s${seq}`,
    pageIndex,
    text: item.str,
    bbox,
    baseline: squashed?.baseline ?? oy,
    fontSize: squashed?.fontSize ?? fontSize,
    fontKey: item.fontName,
    fontName: font?.name ?? item.fontName,
    fontFamily: font?.family ?? style?.fontFamily ?? 'sans-serif',
    bold: font?.bold ?? false,
    italic: font?.italic ?? false,
    rotation: squashed?.rotation ?? rotation,
    vertical,
    source: 'native-pdf',
    confidence: 1,
    hasEOL: item.hasEOL === true,
  };
}

/** U+FFFD 与 C0 控制字符（不含 \t \n \r）都视为编码异常的信号 */
function isBrokenChar(code: number): boolean {
  if (code === 0xfffd) return true;
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return code < 0x20;
}

/** 图块间距不超过这个值（pt）就当同一张图 */
const IMAGE_MERGE_GAP = 3;

/**
 * PPT / Excel 导出的 PDF 常把一张图表切成几十上百个小图块。
 * 相交或贴着的图块合并成一个区域，裁剪一次即可；否则 Word 里会出现上百张碎图。
 * 裁剪发生在版面分析之前，所以合并只能放在抽取这一层。
 */
export function mergeImageTiles(images: readonly PrimitiveImage[]): PrimitiveImage[] {
  if (images.length < 2) return [...images];
  const groups = clusterBoxes(
    images.map((i) => i.bbox),
    IMAGE_MERGE_GAP,
  );
  return groups.map((group) => {
    if (group.length === 1) return images[group[0]];
    const members = group.map((i) => images[i]);
    return {
      id: members[0].id,
      pageIndex: members[0].pageIndex,
      bbox: unionBBox(members.map((m) => m.bbox)),
      isMask: members.every((m) => m.isMask),
    };
  });
}

export function computeTextHealth(
  spans: readonly PrimitiveTextSpan[],
  images: readonly { bbox: BBox }[],
  width: number,
  height: number,
  rawText?: string,
  hiddenText = false,
): TextHealth {
  const text = rawText ?? spans.map((s) => s.text).join('');
  let broken = 0;
  let charCount = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (isBrokenChar(code)) broken++;
    if (ch.trim() !== '') charCount++;
  }
  const total = [...text].length;
  const replacementRatio = total === 0 ? 0 : broken / total;
  const printableRatio = total === 0 ? 1 : 1 - replacementRatio;

  const pageArea = Math.max(1, width * height);
  const imageArea = images.reduce((sum, i) => sum + i.bbox.width * i.bbox.height, 0);
  const textArea = spans.reduce((sum, s) => sum + s.bbox.width * s.bbox.height, 0);

  const imageCoverage = Math.min(1, imageArea / pageArea);
  const textCoverage = Math.min(1, textArea / pageArea);

  return {
    charCount,
    printableRatio,
    replacementRatio,
    imageCoverage,
    textCoverage,
    suspicious: replacementRatio > 0.12 || (charCount > 20 && printableRatio < 0.7),
    hiddenText,
  };
}

/**
 * 可搜索扫描件常把不可见文字压扁去贴合图上的行框：字的朝向是竖的或倒的，
 * 包围盒却是横着的一整行（字号被算成了整行的宽度）。这种片段的包围盒就是行框，
 * 按横排处理：字号取行框高度，基线按普通横排文字估。真正的旋转文字包围盒是竖长的，不受影响。
 */
export function normalizeSquashedSpan(
  rotation: number,
  bbox: BBox,
  vertical: boolean,
  ascentRatio: number,
  hiddenLayer = false,
): { rotation: number; fontSize: number; baseline: number } | null {
  if (vertical || rotation < 45 || rotation > 315) return null;
  // 文字层全是不可见的（可搜索扫描件）时，连页码这种一两个字的方块也是压扁出来的；
  // 否则只处理明显横长的，免得误伤真正竖着写的字
  const minAspect = hiddenLayer ? 0.5 : 1.5;
  if (bbox.width <= bbox.height * minAspect) return null;
  return { rotation: 0, fontSize: bbox.height, baseline: bbox.y + bbox.height * ascentRatio };
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
