import { hexBytes } from './writer.ts';

/**
 * 不嵌字体：拉丁文用 PDF 内置的 14 种标准字体，中日韩用阅读器自带的 CID 字体
 * （Acrobat / Chrome / pdf.js / 预览都认识这几个名字）。文件小，任何机器都能打开。
 */

export type FontFamilyClass = 'sans' | 'serif' | 'mono';

/** 中日韩字体按文种选：字形集不同，简体文档里的繁体字用 GB1 字体可能显示成空白 */
export type CjkFont = 'zh-CN' | 'zh-TW' | 'ja' | 'ko';

export interface CjkFontSpec {
  readonly serif: string;
  readonly sans: string;
  readonly encoding: string;
  readonly ordering: string;
  readonly supplement: number;
}

export const CJK_FONTS: Record<CjkFont, CjkFontSpec> = {
  // GB1 没有公认的黑体标准名，两种都用宋体
  'zh-CN': {
    serif: 'STSong-Light',
    sans: 'STSong-Light',
    encoding: 'UniGB-UCS2-H',
    ordering: 'GB1',
    supplement: 4,
  },
  'zh-TW': {
    serif: 'MSung-Light',
    sans: 'MHei-Medium',
    encoding: 'UniCNS-UCS2-H',
    ordering: 'CNS1',
    supplement: 4,
  },
  ja: {
    serif: 'HeiseiMin-W3',
    sans: 'HeiseiKakuGo-W5',
    encoding: 'UniJIS-UCS2-H',
    ordering: 'Japan1',
    supplement: 6,
  },
  ko: {
    serif: 'HYSMyeongJo-Medium',
    sans: 'HYGoThic-Medium',
    encoding: 'UniKS-UCS2-H',
    ordering: 'Korea1',
    supplement: 2,
  },
};

const STANDARD: Record<FontFamilyClass, readonly [string, string, string, string]> = {
  sans: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  serif: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  mono: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};

export function standardFontName(family: FontFamilyClass, bold: boolean, italic: boolean): string {
  return STANDARD[family][(bold ? 1 : 0) + (italic ? 2 : 0)];
}

/** WinAnsiEncoding 0x80–0x9F 段（其余与 Latin-1 相同）；0 表示该位置没有字符 */
const WINANSI_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0, 0x017e, 0x0178,
];

const WINANSI = new Map<number, number>();
for (let i = 0; i < WINANSI_HIGH.length; i++) {
  if (WINANSI_HIGH[i] !== 0) WINANSI.set(WINANSI_HIGH[i], 0x80 + i);
}
// 网页里常见但 WinAnsi 没有的字符，换成长得一样的
const NEAR: Record<number, number> = {
  0x00a0: 0x20,
  0x2007: 0x20,
  0x202f: 0x20,
  0x2009: 0x20,
  0x200a: 0x20,
  0x2010: 0x2d,
  0x2011: 0x2d,
  0x2212: 0x2d,
  0x2032: 0x27,
  0x02bc: 0x27,
  0x2033: 0x22,
  0x00ad: 0x2d,
};

/** 单个码点在 WinAnsi 里的字节，放不下返回 -1 */
export function winAnsiByte(code: number): number {
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  const near = NEAR[code];
  if (near !== undefined) return near;
  return WINANSI.get(code) ?? -1;
}

/** 文本能不能整个用标准字体写：混排文本要先按字符拆开 */
export function isWinAnsi(code: number): boolean {
  return winAnsiByte(code) >= 0;
}

/** 十六进制串形式的 WinAnsi 文本，供 Tj 使用 */
export function encodeWinAnsi(text: string): string {
  const bytes = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const b = winAnsiByte(ch.codePointAt(0) ?? 0);
    if (b >= 0) bytes[n++] = b;
  }
  return `<${hexBytes(bytes.subarray(0, n))}>`;
}

/** 当前预定义字体只接受 BMP；先放占位符，避免姓名、编号或 emoji 无声消失。 */
export function replaceUnsupportedCharacters(text: string): { text: string; count: number } {
  let count = 0;
  const replaced = text.replace(/[\u{10000}-\u{10ffff}\ud800-\udfff]/gu, () => {
    count++;
    return '□';
  });
  return { text: replaced, count };
}

/** UCS-2 大端（预定义 UCS2 CMap 的输入）。 */
export function encodeUcs2(text: string): string {
  const units: number[] = [];
  for (const ch of replaceUnsupportedCharacters(text).text) {
    const code = ch.charCodeAt(0);
    units.push(code >> 8, code & 0xff);
  }
  return `<${hexBytes(Uint8Array.from(units))}>`;
}

const SERIF_NAMES =
  /times|georgia|garamond|cambria|book|serif|roman|palatino|baskerville|didot|宋|song|sun|mincho|明朝|batang|楷|kai|仿宋|fangsong|华文中宋|noto serif|source han serif|思源宋/i;
const MONO_NAMES =
  /mono|courier|consolas|menlo|monaco|code|sfmono|fira|jetbrains|source code|ubuntu mono|dejavu sans mono|lucida console/i;

/**
 * 把 CSS 的 font-family 归到三类。第一个名字说了算：浏览器实际用的多半也是它。
 * 通用族 serif / monospace 也认，其他一律当无衬线。
 */
export function classifyFamily(fontFamily: string): FontFamilyClass {
  const first =
    fontFamily
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? '';
  if (MONO_NAMES.test(first) || /^monospace$/i.test(first)) return 'mono';
  if (SERIF_NAMES.test(first) || /^serif$/i.test(first)) return 'serif';
  return 'sans';
}

/**
 * 浏览器里排版用的字体栈：拉丁字形用与 PDF 标准字体同度量的 Arial / Times New Roman / Courier New，
 * 这样浏览器算出的换行位置和 PDF 里字的宽度一致；中日韩交给系统字体。
 */
export function canonicalStack(family: FontFamilyClass): string {
  const cjk =
    "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";
  switch (family) {
    case 'serif':
      return `'Times New Roman', Times, 'Liberation Serif', 'Songti SC', SimSun, 'Noto Serif CJK SC', ${cjk}`;
    case 'mono':
      return `'Courier New', 'Liberation Mono', Courier, ${cjk}`;
    default:
      return `Arial, 'Liberation Sans', Helvetica, ${cjk}`;
  }
}
