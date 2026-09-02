import { CJK_FONTS, standardFontName } from './fonts.ts';
import type { CjkFont, FontFamilyClass } from './fonts.ts';
import { PdfBuilder, fmt, latin1, pdfDate, pdfLiteral, pdfTextString } from './writer.ts';

/** 嵌进 PDF 的一张图：JPEG 原样塞进去，其余是未压缩的 8 位采样，写入时 Flate 压缩 */
export interface PdfImageSource {
  readonly filter: 'dct' | 'flate';
  readonly colorSpace: 'rgb' | 'gray';
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** 链接热区，pt，PDF 坐标（原点在左下） */
export interface PdfLink {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

export interface PdfPageInput {
  readonly width: number;
  readonly height: number;
  /** 内容流正文；里面的字体和图片资源名要来自本文档的 font() / addImage() */
  readonly content: string;
  /** 本页用到的资源名；不给就把全部资源都列上（几百页的图片 PDF 会白白多出不少字节） */
  readonly fonts?: ReadonlySet<string>;
  readonly images?: ReadonlySet<string>;
  readonly links?: readonly PdfLink[];
}

export interface PdfDocumentOptions {
  readonly cjk: CjkFont;
  readonly title?: string;
}

interface Resource {
  readonly name: string;
  readonly id: number;
}

/** 页面、字体、图片资源的登记处；内容流由调用方生成 */
export class PdfDocument {
  readonly #builder = new PdfBuilder();
  readonly #pagesId: number;
  readonly #fonts = new Map<string, Resource>();
  readonly #images = new Map<string, Resource>();
  readonly #pageIds: number[] = [];
  readonly #options: PdfDocumentOptions;

  constructor(options: PdfDocumentOptions) {
    this.#options = options;
    this.#pagesId = this.#builder.reserve();
  }

  get pageCount(): number {
    return this.#pageIds.length;
  }

  /** 字体资源名（如 /F1）；第一次用到才创建对象 */
  font(family: FontFamilyClass, bold: boolean, italic: boolean, cjk: boolean): string {
    const key = cjk
      ? `cjk:${family === 'serif' ? 'serif' : 'sans'}`
      : standardFontName(family, bold, italic);
    const existing = this.#fonts.get(key);
    if (existing !== undefined) return existing.name;
    const name = `/F${this.#fonts.size + 1}`;
    const id = cjk ? this.#cjkFont(family === 'serif') : this.#standardFont(key);
    this.#fonts.set(key, { name, id });
    return name;
  }

  #standardFont(baseFont: string): number {
    return this.#builder.add(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`,
    );
  }

  /** 不嵌入的 CID 字体：靠预定义 CMap 把 UCS-2 映射到阅读器自带的中日韩字体 */
  #cjkFont(serif: boolean): number {
    const spec = CJK_FONTS[this.#options.cjk];
    const base = serif ? spec.serif : spec.sans;
    const descriptor = this.#builder.add(
      `<< /Type /FontDescriptor /FontName /${base} /Flags ${serif ? 6 : 4} /FontBBox [-200 -300 1100 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>`,
    );
    const descendant = this.#builder.add(
      `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (${spec.ordering}) /Supplement ${spec.supplement} >> /FontDescriptor ${descriptor} 0 R /DW 1000 >>`,
    );
    return this.#builder.add(
      `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /${spec.encoding} /DescendantFonts [${descendant} 0 R] >>`,
    );
  }

  /** 图片资源名（如 /Im1）；同一个 key 只嵌一次 */
  addImage(key: string, source: PdfImageSource): string {
    const existing = this.#images.get(key);
    if (existing !== undefined) return existing.name;
    const name = `/Im${this.#images.size + 1}`;
    const colorSpace = source.colorSpace === 'gray' ? '/DeviceGray' : '/DeviceRGB';
    const dict = ` /Type /XObject /Subtype /Image /Width ${source.width} /Height ${source.height} /BitsPerComponent 8 /ColorSpace ${colorSpace}${source.filter === 'dct' ? ' /Filter /DCTDecode' : ''}`;
    const id = this.#builder.addStream(dict, source.data, source.filter === 'flate');
    this.#images.set(key, { name, id });
    return name;
  }

  addPage(page: PdfPageInput): void {
    const contentId = this.#builder.addStream('', latin1(page.content));
    const list = (all: Map<string, Resource>, used?: ReadonlySet<string>): string =>
      [...all.values()]
        .filter((r) => used === undefined || used.has(r.name))
        .map((r) => `${r.name} ${r.id} 0 R`)
        .join(' ');
    const fonts = list(this.#fonts, page.fonts);
    const images = list(this.#images, page.images);
    const resources = `<< /ProcSet [/PDF /Text /ImageC /ImageB] /Font << ${fonts} >> /XObject << ${images} >> >>`;
    const annots =
      page.links === undefined || page.links.length === 0
        ? ''
        : ` /Annots [${page.links
            .map(
              (l) =>
                `<< /Type /Annot /Subtype /Link /Rect [${fmt(l.x)} ${fmt(l.y)} ${fmt(l.x + l.width)} ${fmt(l.y + l.height)}] /Border [0 0 0] /A << /S /URI /URI ${pdfLiteral(encodeURI(l.url))} >> >>`,
            )
            .join(' ')}]`;
    const id = this.#builder.add(
      `<< /Type /Page /Parent ${this.#pagesId} 0 R /MediaBox [0 0 ${fmt(page.width)} ${fmt(page.height)}] /Resources ${resources} /Contents ${contentId} 0 R${annots} >>`,
    );
    this.#pageIds.push(id);
  }

  finish(): Uint8Array {
    if (this.#pageIds.length === 0) throw new Error('pdf has no pages');
    this.#builder.set(
      this.#pagesId,
      `<< /Type /Pages /Kids [${this.#pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.#pageIds.length} >>`,
    );
    const catalog = this.#builder.add(`<< /Type /Catalog /Pages ${this.#pagesId} 0 R >>`);
    const title =
      this.#options.title === undefined ? '' : ` /Title ${pdfTextString(this.#options.title)}`;
    const info = this.#builder.add(
      `<< /Producer (Local PDF) /Creator (Local PDF)${title} /CreationDate ${pdfDate(new Date())} >>`,
    );
    return this.#builder.build({ root: catalog, info });
  }
}
