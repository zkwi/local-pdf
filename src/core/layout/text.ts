/**
 * 中英文混排的拼接规则。PDF 里没有"词"的概念，空格全靠几何间距推断，
 * 中文按西文规则处理会产生大量错误空格，所以这里必须分开处理。
 */
import type { ListMarkerStyle } from '../contracts/layout.ts';

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

export function isLatinLetter(ch: string): boolean {
  return /[A-Za-z]/.test(ch);
}

export function containsCjk(text: string): boolean {
  for (const ch of text) {
    if (isCjkChar(ch)) return true;
  }
  return false;
}

function lastChar(text: string): string {
  const chars = [...text];
  return chars.length === 0 ? '' : chars[chars.length - 1];
}

function firstChar(text: string): string {
  for (const ch of text) return ch;
  return '';
}

export interface SpanLike {
  readonly text: string;
  readonly bbox: { readonly x: number; readonly width: number };
  readonly fontSize: number;
}

/**
 * 行内 span 拼接：只有西文之间的明显间距才补空格；
 * 任一侧是 CJK 时不补，除非间距大到接近一个全角字符宽（多为制表位）。
 */
export function needsSpaceBetween(leftText: string, prev: SpanLike, next: SpanLike): boolean {
  if (leftText === '' || next.text === '') return false;
  if (/\s$/.test(leftText) || /^\s/.test(next.text)) return false;

  const gap = next.bbox.x - (prev.bbox.x + prev.bbox.width);
  const em = Math.min(prev.fontSize, next.fontSize) || next.fontSize || 10;
  const cjkBoundary = isCjkChar(lastChar(leftText)) || isCjkChar(firstChar(next.text));
  const threshold = cjkBoundary ? em * 0.9 : em * 0.22;
  return gap > threshold;
}

export function joinSpans(spans: readonly SpanLike[]): string {
  if (spans.length === 0) return '';
  let out = spans[0].text;
  for (let i = 1; i < spans.length; i++) {
    out += needsSpaceBetween(out, spans[i - 1], spans[i]) ? ` ${spans[i].text}` : spans[i].text;
  }
  return out;
}

export type LineJoinAction = 'none' | 'space' | 'dehyphen';

/** 决定两行之间怎么接：直接相连、补空格、还是去掉行尾连字符 */
export function lineJoinAction(previous: string, next: string): LineJoinAction {
  if (previous === '' || next === '') return 'none';
  const left = lastChar(previous);
  const right = firstChar(next);

  if (left === '-' || left === '­') {
    const beforeHyphen = [...previous].at(-2) ?? '';
    if (isLatinLetter(beforeHyphen) && /[a-z]/.test(right)) return 'dehyphen';
  }
  if (/\s$/.test(previous)) return 'none';
  if (isCjkChar(left) || isCjkChar(right)) return 'none';
  return 'space';
}

/**
 * 行间拼接（同一段落内的换行）：
 * - 西文行尾连字符 + 下一行小写字母 → 认为是断词，去掉连字符直接接上
 * - 任一侧是 CJK → 直接相接，不补空格
 * - 其余按西文补一个空格
 */
export function joinLineTexts(previous: string, next: string): string {
  if (previous === '') return next;
  if (next === '') return previous;
  switch (lineJoinAction(previous, next)) {
    case 'dehyphen':
      return previous.slice(0, -1) + next;
    case 'space':
      return `${previous} ${next}`;
    case 'none':
      return previous + next;
  }
}

/** 行末是否像一句话结束（用于段落切分的辅助信号） */
export function endsSentence(text: string): boolean {
  const ch = lastChar(text.trimEnd());
  return '.。!！?？;；:："”』」）)'.includes(ch);
}

const BULLET_MARKERS = /^([•·▪◦‣⁃●○■□⁃∙*–—-])\s+/;
const ORDERED_MARKERS =
  /^(\(?\d+(\.\d+)*[.)）、]|\(?[a-zA-Z][.)）]|[①-⑳]|[一二三四五六七八九十百]+[、.)]|（\d+）|\(\d+\))\s*/;

export interface ListMarker {
  readonly ordered: boolean;
  readonly marker: string;
  readonly rest: string;
  readonly style: ListMarkerStyle;
}

function classifyMarker(marker: string): ListMarkerStyle {
  if (/^\(|^（/.test(marker)) return 'other';
  if (/^\d+\.\d/.test(marker)) return 'other';
  if (/^\d+[.)]$/.test(marker)) return 'decimal';
  if (/^[a-zA-Z][.)]$/.test(marker)) return 'letter';
  return 'other';
}

/** 识别行首的项目符号 / 编号；识别不出返回 null */
export function matchListMarker(text: string): ListMarker | null {
  const bullet = BULLET_MARKERS.exec(text);
  if (bullet !== null) {
    return {
      ordered: false,
      marker: bullet[1],
      rest: text.slice(bullet[0].length),
      style: 'bullet',
    };
  }
  const ordered = ORDERED_MARKERS.exec(text);
  if (ordered !== null) {
    const marker = ordered[1];
    // "2013." 这种年份不算编号，"1." 这种才算
    if (/^\d{4}[.)]/.test(marker)) return null;
    return {
      ordered: true,
      marker,
      rest: text.slice(ordered[0].length),
      style: classifyMarker(marker),
    };
  }
  return null;
}

/** 章节编号，如 "3.2.1 概述"，用于标题层级判断 */
export function matchSectionNumber(text: string): number | null {
  const m = /^(\d+(?:\.\d+)*)\s+\S/.exec(text.trim());
  if (m === null) return null;
  const depth = m[1].split('.').length;
  return depth >= 1 && depth <= 4 ? depth : null;
}
