import { ContentStream } from './content.ts';
import { PdfDocument } from './document.ts';
import type { PdfImageSource, PdfLink } from './document.ts';
import {
  columnFragmenter,
  extractOps,
  measureBaselineRatio,
  repeatingFragmenter,
} from './dom-extract.ts';
import type { DrawOp, TextRun } from './dom-extract.ts';
import {
  canonicalStack,
  classifyFamily,
  encodeUcs2,
  encodeWinAnsi,
  replaceUnsupportedCharacters,
} from './fonts.ts';
import type { CjkFont, FontFamilyClass } from './fonts.ts';
import { isJpeg, parseJpeg } from './jpeg.ts';
import { PX_TO_PT } from './page-layout.ts';
import { encodeDrawable } from './raster.ts';
import { isLocalImageSource, unsupportedImageFormat, waitForResource } from './resources.ts';

/**
 * HTML → PDF：让浏览器在隐藏 iframe 里排版，用多栏布局切页，再按量到的坐标写成矢量 PDF。
 * 文字可选中可搜索，图片按原始分辨率嵌入，文件不嵌字体。
 */

/** 全部 pt */
export interface PageGeometry {
  readonly width: number;
  readonly height: number;
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /** 页眉顶边、页脚底边到纸边的距离 */
  readonly headerDistance: number;
  readonly footerDistance: number;
}

export interface Section {
  /** 正文容器：它的子节点会被搬进分页容器；className 一并带过去（docx 的样式靠它作用域） */
  readonly body: HTMLElement;
  readonly header?: HTMLElement | null;
  readonly footer?: HTMLElement | null;
  readonly geometry: PageGeometry;
}

/** 往 iframe 文档里填内容，返回要分页的各节 */
export type Producer = (doc: Document, signal?: AbortSignal) => Promise<readonly Section[]>;

export type HtmlPdfStage = 'render' | 'layout' | 'images' | 'write';

export interface HtmlToPdfHooks {
  readonly signal?: AbortSignal;
  readonly onProgress?: (stage: HtmlPdfStage, done: number, total: number) => void;
}

export interface HtmlToPdfOptions {
  readonly cjk: CjkFont;
  readonly title?: string;
}

export interface HtmlToPdfResult {
  readonly bytes: Uint8Array;
  readonly pages: number;
  /** 没能嵌入的图片数量 */
  readonly imagesSkipped: number;
  readonly unsupportedImageFormats: readonly string[];
  readonly charactersReplaced: number;
  readonly blockedContent: number;
}

const PT_TO_PX = 96 / 72;
/** 栏间距要比任何元素可能溢出的宽度大，免得下一页的东西被算到上一页 */
const COLUMN_GAP = 64;
/** 页眉页脚和正文之间至少留这么多 pt */
const HEADER_GAP = 6;

type BaselineRatio = (family: FontFamilyClass, cjk: boolean) => number;

interface PageBuild {
  readonly geometry: PageGeometry;
  readonly ops: readonly DrawOp[];
}

export async function htmlToPdf(
  produce: Producer,
  options: HtmlToPdfOptions,
  hooks: HtmlToPdfHooks = {},
): Promise<HtmlToPdfResult> {
  hooks.signal?.throwIfAborted();
  const frame = await openFrame(hooks.signal);
  try {
    const doc = frame.contentDocument;
    if (doc === null) throw new Error('iframe document unavailable');
    hooks.onProgress?.('render', 0, 1);
    const sections = await waitForResource(produce(doc, hooks.signal), hooks.signal, 60_000);
    hooks.signal?.throwIfAborted();
    const roots = sections.flatMap((s) =>
      [s.body, s.header, s.footer].filter((el): el is HTMLElement => el != null),
    );
    let blockedContent = roots.reduce(
      (n, root) => n + Number(root.dataset.lpBlockedContent ?? 0),
      0,
    );
    let charactersReplaced = 0;
    const formats = new Set<string>();
    // Word 的节此时可能还未挂载；解码、字体替换和测量必须在同一个文档里进行。
    for (const root of roots) {
      for (const img of root.querySelectorAll('img')) {
        const src = img.getAttribute('src') ?? '';
        const format = unsupportedImageFormat(src);
        if (format !== null) {
          formats.add(format);
          img.dataset.lpImageFormat = format;
        }
        if (src !== '' && !isLocalImageSource(src)) {
          img.removeAttribute('src');
          if (format === null) blockedContent++;
        }
        img.removeAttribute('srcset');
      }
      doc.body.append(root);
    }
    await settle(doc, hooks.signal);
    let imagesSkipped = 0;
    for (const root of roots) {
      for (const img of root.querySelectorAll('img')) {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) continue;
        const placeholder = doc.createElement('span');
        placeholder.textContent = `[${img.dataset.lpImageFormat ?? img.alt ?? ''}]`;
        if (placeholder.textContent === '[]') placeholder.textContent = '[×]';
        img.replaceWith(placeholder);
        imagesSkipped++;
      }
      // 图片失败后的替代文字也要检查，不能漏掉 alt 里的罕见字符。
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode() !== null) {
        const node = walker.currentNode as Text;
        if (node.parentElement?.closest('style,script,template')) continue;
        const replaced = replaceUnsupportedCharacters(node.data);
        charactersReplaced += replaced.count;
        node.data = replaced.text;
      }
    }
    canonicalize(doc.body);
    const ratios = baselineRatios(doc);

    const pages: PageBuild[] = [];
    sections.forEach((section, i) => {
      hooks.onProgress?.('layout', i, sections.length);
      pages.push(...paginate(doc, section, ratios));
    });
    hooks.signal?.throwIfAborted();

    const pdf = new PdfDocument({ cjk: options.cjk, title: options.title });
    const images = new Map<HTMLImageElement, string | null>();
    const imageElements = [
      ...new Set(
        pages.flatMap((p) => p.ops.flatMap((op) => (op.kind === 'image' ? [op.image] : []))),
      ),
    ];
    for (let i = 0; i < imageElements.length; i++) {
      hooks.onProgress?.('images', i, imageElements.length);
      hooks.signal?.throwIfAborted();
      const img = imageElements[i];
      try {
        images.set(img, pdf.addImage(`img${i}`, await encodeImage(img, hooks.signal)));
      } catch {
        hooks.signal?.throwIfAborted();
        images.set(img, null);
        imagesSkipped++;
      }
    }

    pages.forEach((page, i) => {
      hooks.onProgress?.('write', i, pages.length);
      const { stream, links } = emitPage(pdf, page, images, i + 1, pages.length);
      pdf.addPage({
        width: page.geometry.width,
        height: page.geometry.height,
        content: stream.toString(),
        fonts: stream.fonts,
        images: stream.images,
        links,
      });
    });
    hooks.signal?.throwIfAborted();
    return {
      bytes: pdf.finish(),
      pages: pages.length,
      imagesSkipped,
      unsupportedImageFormats: [...formats],
      charactersReplaced,
      blockedContent,
    };
  } finally {
    frame.remove();
  }
}

async function openFrame(signal?: AbortSignal): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  const ready = new Promise<HTMLIFrameElement>((resolve, reject) => {
    // 只要同源（好读 DOM），不给脚本：Markdown 里的原始 HTML 不能在这里执行
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText =
      'position:fixed;left:-100000px;top:0;width:1400px;height:1000px;border:0;visibility:hidden';
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; connect-src data: blob:; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;padding:0}img{max-width:100%;height:auto}table{max-width:100%}tr,img{break-inside:avoid}h1,h2,h3,h4,h5,h6{break-after:avoid}</style></head><body></body></html>`;
    frame.onload = () => resolve(frame);
    frame.onerror = () => reject(new Error('render frame failed to load'));
    document.body.append(frame);
  });
  try {
    return await waitForResource(ready, signal);
  } catch (error) {
    frame.remove();
    throw error;
  }
}

/** 图片没解码完之前尺寸是 0，排版会错 */
async function settle(doc: Document, signal?: AbortSignal): Promise<void> {
  await waitForResource(
    Promise.all(
      [...doc.images].map((img) =>
        img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
      ),
    ),
    signal,
  ).catch(() => signal?.throwIfAborted());
  await waitForResource(doc.fonts.ready, signal).catch(() => signal?.throwIfAborted());
  signal?.throwIfAborted();
}

/**
 * 把所有字体换成和 PDF 标准字体同度量的族，换行位置才对得上；
 * 顺便把 page-break 改成 column break，让多栏分页认识它。
 */
export function canonicalize(root: HTMLElement): void {
  const view = root.ownerDocument.defaultView;
  if (view === null) return;
  const writes: (() => void)[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const s = view.getComputedStyle(el);
    const stack = canonicalStack(classifyFamily(s.fontFamily));
    if (s.fontFamily !== stack) writes.push(() => (el.style.fontFamily = stack));
    if (s.breakBefore === 'page' || s.breakBefore === 'always' || s.pageBreakBefore === 'always') {
      writes.push(() => (el.style.breakBefore = 'column'));
    }
    if (s.breakAfter === 'page' || s.breakAfter === 'always' || s.pageBreakAfter === 'always') {
      writes.push(() => (el.style.breakAfter = 'column'));
    }
  }
  for (const write of writes) write();
}

function baselineRatios(doc: Document): BaselineRatio {
  const cache = new Map<string, number>();
  return (family, cjk) => {
    const key = `${family}:${cjk ? 1 : 0}`;
    let ratio = cache.get(key);
    if (ratio === undefined) {
      ratio = measureBaselineRatio(doc, canonicalStack(family), cjk);
      cache.set(key, ratio);
    }
    return ratio;
  };
}

/** 页眉页脚放进一个和内容区同宽的盒子里，量高度、取绘制指令 */
function mount(doc: Document, el: HTMLElement, width: number): HTMLElement {
  const box = doc.createElement('div');
  box.className = el.className;
  box.style.cssText = `position:relative;width:${width}px;margin-bottom:200px;`;
  el.style.marginTop = '0';
  el.style.marginBottom = '0';
  el.style.minHeight = '0';
  box.append(el);
  doc.body.append(box);
  return box;
}

function paginate(doc: Document, section: Section, ratios: BaselineRatio): PageBuild[] {
  const g = section.geometry;
  const contentWidth = (g.width - g.margins.left - g.margins.right) * PT_TO_PX;
  const left = g.margins.left * PT_TO_PX;

  // 页眉页脚先量高度：像 Word 一样，正文要让开它们，边距不够时往里推
  const headerBox = section.header ? mount(doc, section.header, contentWidth) : null;
  const footerBox = section.footer ? mount(doc, section.footer, contentWidth) : null;
  const headerHeight = headerBox === null ? 0 : headerBox.getBoundingClientRect().height * PX_TO_PT;
  const footerHeight = footerBox === null ? 0 : footerBox.getBoundingClientRect().height * PX_TO_PT;
  const top = Math.max(
    g.margins.top,
    headerHeight > 0 ? g.headerDistance + headerHeight + HEADER_GAP : 0,
  );
  const bottom = Math.max(
    g.margins.bottom,
    footerHeight > 0 ? g.footerDistance + footerHeight + HEADER_GAP : 0,
  );
  const contentHeight = Math.max(72, g.height - top - bottom) * PT_TO_PX;

  const pager = doc.createElement('div');
  pager.className = section.body.className;
  pager.style.cssText = `position:absolute;left:0;top:0;width:${contentWidth}px;height:${contentHeight}px;column-width:${contentWidth}px;column-gap:${COLUMN_GAP}px;column-fill:auto;overflow:visible;`;
  while (section.body.firstChild !== null) pager.append(section.body.firstChild);
  const stage = doc.createElement('div');
  stage.style.cssText = `position:relative;width:${contentWidth}px;height:${contentHeight}px;margin-bottom:200px;`;
  stage.append(pager);
  doc.body.append(stage);

  const bodyOps = extractOps(pager, {
    fragmenter: columnFragmenter(pager, contentWidth, COLUMN_GAP, left, top * PT_TO_PX),
    baselineRatio: ratios,
  });
  let pageCount = 1;
  for (const op of bodyOps) pageCount = Math.max(pageCount, op.page + 1);

  const repeating: DrawOp[] = [];
  if (headerBox !== null) {
    repeating.push(
      ...extractOps(headerBox, {
        fragmenter: repeatingFragmenter(headerBox, left, g.headerDistance * PT_TO_PX),
        baselineRatio: ratios,
      }),
    );
  }
  if (footerBox !== null) {
    const y = (g.height - g.footerDistance - footerHeight) * PT_TO_PX;
    repeating.push(
      ...extractOps(footerBox, {
        fragmenter: repeatingFragmenter(footerBox, left, y),
        baselineRatio: ratios,
      }),
    );
  }

  const byPage: DrawOp[][] = Array.from({ length: pageCount }, () => [...repeating]);
  for (const op of bodyOps) byPage[op.page].push(op);
  return byPage.map((ops) => ({ geometry: g, ops }));
}

/** 原始 JPEG 直接嵌；其他的（含 EXIF 需要旋转的）从已解码的元素重新编码 */
async function encodeImage(img: HTMLImageElement, signal?: AbortSignal): Promise<PdfImageSource> {
  const src = img.currentSrc || img.src;
  if (!isLocalImageSource(src)) throw new Error('image source is not local');
  if (src !== '') {
    try {
      const buffer = await waitForResource(
        fetch(src, { signal }).then((r) => r.arrayBuffer()),
        signal,
      );
      const bytes = new Uint8Array(buffer);
      if (isJpeg(bytes)) {
        const info = parseJpeg(bytes);
        if (
          info !== null &&
          info.orientation === 1 &&
          (info.components === 3 || info.components === 1)
        ) {
          return {
            filter: 'dct',
            colorSpace: info.components === 1 ? 'gray' : 'rgb',
            data: bytes,
            width: info.width,
            height: info.height,
          };
        }
      }
    } catch {
      signal?.throwIfAborted();
      /* 取不到字节就走画布 */
    }
  }
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error('image not decoded');
  return encodeDrawable(img, img.naturalWidth, img.naturalHeight, 'auto');
}

function emitPage(
  pdf: PdfDocument,
  page: PageBuild,
  images: ReadonlyMap<HTMLImageElement, string | null>,
  pageNumber: number,
  pageTotal: number,
): { stream: ContentStream; links: PdfLink[] } {
  const cs = new ContentStream();
  const links: PdfLink[] = [];
  const H = page.geometry.height;
  const pt = (px: number): number => px * PX_TO_PT;
  for (const op of page.ops) {
    switch (op.kind) {
      case 'rect':
        cs.fillRect(pt(op.x), H - pt(op.y + op.height), pt(op.width), pt(op.height), op.color);
        break;
      case 'image': {
        const name = images.get(op.image);
        if (name !== null && name !== undefined) {
          cs.image(name, pt(op.x), H - pt(op.y + op.height), pt(op.width), pt(op.height));
        }
        break;
      }
      case 'link':
        links.push({
          x: pt(op.x),
          y: H - pt(op.y + op.height),
          width: pt(op.width),
          height: pt(op.height),
          url: op.url,
        });
        break;
      case 'text':
        // 页码域在版面里占位的是 "1"，这里换成真正的页码
        emitText(
          pdf,
          cs,
          op.field === undefined
            ? op
            : { ...op, text: String(op.field === 'page' ? pageNumber : pageTotal) },
          H,
        );
        break;
    }
  }
  return { stream: cs, links };
}

function emitText(pdf: PdfDocument, cs: ContentStream, op: TextRun, pageHeight: number): void {
  const size = op.size * PX_TO_PT;
  const x = op.x * PX_TO_PT;
  const y = pageHeight - op.baseline * PX_TO_PT;
  const width = op.width * PX_TO_PT;
  cs.text({
    font: pdf.font(op.family, op.bold, op.italic, op.cjk),
    size,
    x,
    y,
    hex: op.cjk ? encodeUcs2(op.text) : encodeWinAnsi(op.text),
    color: op.color,
    fakeBold: op.cjk && op.bold,
    skew: op.cjk && op.italic,
    charSpacing: op.letterSpacing * PX_TO_PT,
  });
  const thickness = Math.max(0.5, size * 0.06);
  if (op.underline) cs.fillRect(x, y - size * 0.15, width, thickness, op.color);
  if (op.strike) cs.fillRect(x, y + size * 0.28, width, thickness, op.color);
}
