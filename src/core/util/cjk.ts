/**
 * CJK 字符判断。版面拼接、OCR 字号估计都要区分中西文，放在最底层让 layout 和 ocr 都能用。
 */
const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x11ff], // 韩文字母
  [0x2e80, 0x2eff], // 康熙部首补充
  [0x3000, 0x303f], // CJK 标点
  [0x3040, 0x30ff], // 平假名 / 片假名
  [0x3100, 0x312f], // 注音
  [0x3130, 0x318f], // 韩文兼容字母
  [0x3400, 0x4dbf], // 扩展 A
  [0x4e00, 0x9fff], // 基本区
  [0xa960, 0xa97f],
  [0xac00, 0xd7af], // 韩文音节
  [0xf900, 0xfaff], // 兼容表意
  [0xfe30, 0xfe4f], // CJK 兼容形式
  [0xff00, 0xff60], // 全角形式
  [0xffe0, 0xffe6],
  [0x20000, 0x2ffff], // 扩展 B 及以后
];

export function isCjkChar(ch: string): boolean {
  const code = ch.codePointAt(0);
  if (code === undefined) return false;
  return CJK_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
}

export function containsCjk(text: string): boolean {
  for (const ch of text) {
    if (isCjkChar(ch)) return true;
  }
  return false;
}
