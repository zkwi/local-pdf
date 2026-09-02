/**
 * Wingdings / Symbol 这类符号字体把字形放在私用区 U+F0xx，
 * Word 里没有对应字体就是一个方框。把常见的项目符号映射成通用 Unicode。
 */
const SYMBOL_FONT = /wingdings|webdings|symbol|zapf|dingbat/i;

const WINGDINGS: Record<number, string> = {
  0xf06c: '●',
  0xf06d: '○',
  0xf06e: '■',
  0xf06f: '□',
  0xf070: '◆',
  0xf071: '❖',
  0xf075: '◆',
  0xf076: '❖',
  0xf0a1: '○',
  0xf0a2: '○',
  0xf0a7: '▪',
  0xf0a8: '□',
  0xf0b2: '■',
  0xf0b7: '•',
  0xf0d8: '➢',
  0xf0e0: '➔',
  0xf0f0: '⇨',
  0xf0fc: '✓',
  0xf0fe: '☑',
  0xf0a4: '◉',
  0xf077: '◆',
};

const SYMBOL: Record<number, string> = {
  0xf0b7: '•',
  0xf0b2: '■',
  0xf0a8: '◊',
  0xf0ae: '→',
  0xf0ac: '←',
  0xf0b0: '°',
  0xf0b1: '±',
  0xf0b3: '≥',
  0xf0a3: '≤',
  0xf0b9: '≠',
  0xf0bb: '≈',
};

export function isSymbolFont(fontName: string | undefined): boolean {
  return fontName !== undefined && SYMBOL_FONT.test(fontName);
}

/** 符号字体里的私用区字符换成通用符号；认不出的私用区字符当项目符号 */
export function mapSymbolFontText(fontName: string, text: string): string {
  const table = /symbol/i.test(fontName) && !/wingdings/i.test(fontName) ? SYMBOL : WINGDINGS;
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xe000 && code <= 0xf8ff) {
      const low = code >= 0xf000 ? code : code + 0xf000 - 0xe000;
      out += table[low] ?? WINGDINGS[low] ?? SYMBOL[low] ?? '•';
    } else {
      out += ch;
    }
  }
  return out;
}
