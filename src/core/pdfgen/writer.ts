import { zlibSync } from 'fflate';

/**
 * 最小的 PDF 对象序列化器：只管对象编号、流、交叉引用表和 trailer。
 * 页面、字体、图片这些结构由上层拼字典字符串，这里不认识它们。
 */

/** 对象体里只允许 Latin-1：文本一律先转成十六进制串再放进来 */
export function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** PDF 里的数字：最多三位小数，不用科学计数法 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

export function hexBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** 元数据和注释里的文本：UTF-16BE 带 BOM 的十六进制串，任何字符都放得下 */
export function pdfTextString(text: string): string {
  const units: number[] = [0xfe, 0xff];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    units.push(code >> 8, code & 0xff);
  }
  return `<${hexBytes(Uint8Array.from(units))}>`;
}

/** 括号串（只用于 URL 这类 ASCII 内容） */
export function pdfLiteral(text: string): string {
  return `(${text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;
}

export function pdfDate(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `(D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z)`;
}

export class PdfBuilder {
  readonly #objects: (Uint8Array | null)[] = [];

  /** 先占一个编号，稍后再填内容（页面树需要先知道自己的编号） */
  reserve(): number {
    this.#objects.push(null);
    return this.#objects.length;
  }

  set(id: number, body: string | Uint8Array): void {
    this.#objects[id - 1] = typeof body === 'string' ? latin1(body) : body;
  }

  add(body: string | Uint8Array): number {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  /**
   * 流对象。dict 是不含 Length / Filter 的字典正文（如 " /Type /XObject ..."）；
   * compress 为 true 时用 Flate 压缩，false 表示数据已经带了自己的 Filter（JPEG、预压缩的像素）。
   */
  addStream(dict: string, data: Uint8Array, compress = true): number {
    // FlateDecode 要的是带 zlib 头的流，不是裸 DEFLATE
    const payload = compress ? zlibSync(data, { level: 6 }) : data;
    const filter = compress ? ' /Filter /FlateDecode' : '';
    const head = latin1(`<<${dict}${filter} /Length ${payload.length} >>\nstream\n`);
    return this.add(concatBytes([head, payload, latin1('\nendstream')]));
  }

  build(trailer: { readonly root: number; readonly info?: number }): Uint8Array {
    const header = latin1('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
    const parts: Uint8Array[] = [header];
    let offset = header.length;
    const offsets: number[] = [];
    this.#objects.forEach((body, i) => {
      if (body === null) throw new Error(`pdf object ${i + 1} was reserved but never set`);
      offsets.push(offset);
      const head = latin1(`${i + 1} 0 obj\n`);
      const tail = latin1('\nendobj\n');
      parts.push(head, body, tail);
      offset += head.length + body.length + tail.length;
    });
    const size = this.#objects.length + 1;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
    const info = trailer.info === undefined ? '' : ` /Info ${trailer.info} 0 R`;
    xref += `trailer\n<< /Size ${size} /Root ${trailer.root} 0 R${info} >>\nstartxref\n${offset}\n%%EOF\n`;
    parts.push(latin1(xref));
    return concatBytes(parts);
  }
}
