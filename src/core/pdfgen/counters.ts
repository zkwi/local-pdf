/**
 * CSS 计数器样式 → 文本。Markdown 的有序列表和 Word 的自动编号都靠它生成编号文字：
 * 浏览器画的 ::marker / ::before 内容读不出来，只能自己算一遍再写成真正的文字。
 */

const CJK_DIGITS = '〇一二三四五六七八九';
const CJK_FORMAL = '零壹贰叁肆伍陆柒捌玖';
const KATAKANA =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

function alpha(n: number, upper: boolean): string {
  let s = '';
  let v = n;
  while (v > 0) {
    v--;
    s = String.fromCharCode(97 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return upper ? s.toUpperCase() : s;
}

const ROMAN: readonly [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function roman(n: number, upper: boolean): string {
  let s = '';
  let v = n;
  for (const [value, symbol] of ROMAN) {
    while (v >= value) {
      s += symbol;
      v -= value;
    }
  }
  return upper ? s.toUpperCase() : s;
}

/** 一、二…十、十一…二十、九十九、一百 */
function chineseInformal(n: number, digits: string): string {
  if (n <= 0 || n >= 10000) return String(n);
  const d = (i: number): string => digits[i];
  const parts: string[] = [];
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  if (thousands > 0) parts.push(d(thousands) + '千');
  if (hundreds > 0) parts.push(d(hundreds) + '百');
  else if (thousands > 0 && (tens > 0 || ones > 0)) parts.push(d(0));
  if (tens > 0) parts.push((tens === 1 && n < 20 ? '' : d(tens)) + '十');
  else if (hundreds > 0 && ones > 0) parts.push(d(0));
  if (ones > 0) parts.push(d(ones));
  return parts.join('');
}

export function formatCounter(n: number, style: string): string {
  switch (style) {
    case 'none':
      return '';
    case 'disc':
      return '•';
    case 'circle':
      return '◦';
    case 'square':
      return '▪';
    case 'decimal-leading-zero':
      return n < 10 && n >= 0 ? `0${n}` : String(n);
    case 'lower-alpha':
    case 'lower-latin':
      return n > 0 ? alpha(n, false) : String(n);
    case 'upper-alpha':
    case 'upper-latin':
      return n > 0 ? alpha(n, true) : String(n);
    case 'lower-roman':
      return n > 0 ? roman(n, false) : String(n);
    case 'upper-roman':
      return n > 0 ? roman(n, true) : String(n);
    case 'cjk-ideographic':
    case 'simp-chinese-informal':
    case 'trad-chinese-informal':
    case 'japanese-informal':
      return chineseInformal(n, CJK_DIGITS);
    case 'simp-chinese-formal':
    case 'trad-chinese-formal':
    case 'japanese-formal':
      return chineseInformal(n, CJK_FORMAL);
    case 'cjk-decimal':
      return n >= 0 ? [...String(n)].map((c) => CJK_DIGITS[Number(c)]).join('') : String(n);
    case 'katakana':
    case 'katakana-iroha':
      return n > 0 && n <= KATAKANA.length ? KATAKANA[n - 1] : String(n);
    default:
      return String(n);
  }
}

/** 项目符号按层级轮换，和浏览器默认一致 */
export function bulletFor(depth: number): string {
  return ['•', '◦', '▪'][depth % 3];
}

/**
 * 解析 docx-preview 生成的 ::before content 值，如
 *   `"" counter(docx-num-3-0, decimal) "." counter(docx-num-3-1, decimal) "\9"`
 * 返回片段列表：字符串原样，counter 记下名字和样式。
 */
export type ContentPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'counter'; readonly name: string; readonly style: string };

export function parseContent(value: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|counter\(\s*([^,)\s]+)\s*(?:,\s*([^)\s]+))?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m[1] !== undefined) {
      const text = m[1].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) =>
        String.fromCodePoint(parseInt(hex, 16)),
      );
      if (text !== '') parts.push({ kind: 'text', text });
    } else if (m[2] !== undefined) {
      parts.push({ kind: 'counter', name: m[2], style: m[3] ?? 'decimal' });
    }
  }
  return parts;
}
