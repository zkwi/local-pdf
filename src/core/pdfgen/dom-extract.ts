import type { Rgb } from './content.ts';
import { classifyFamily, isWinAnsi } from './fonts.ts';
import type { FontFamilyClass } from './fonts.ts';

/**
 * 从浏览器排好版的 DOM 里读出"画什么、画在哪"：文字按行片段、图片、背景和边框、链接热区。
 * 坐标是 CSS 像素，原点在页面内容区左上角，由 Fragmenter 把视口坐标换算成页码 + 页内坐标。
 */

export interface Located {
  /** -1 表示每一页都画（页眉页脚） */
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

export interface Fragmenter {
  readonly locate: (rect: DOMRectReadOnly) => Located;
}

export interface TextRun {
  readonly kind: 'text';
  readonly page: number;
  readonly x: number;
  readonly baseline: number;
  /** 浏览器量出来的片段宽度，画下划线用 */
  readonly width: number;
  readonly size: number;
  readonly family: FontFamilyClass;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly cjk: boolean;
  readonly color: Rgb;
  readonly text: string;
  readonly letterSpacing: number;
  readonly underline: boolean;
  readonly strike: boolean;
  /** 页码域：版面里占位的文字是 "1"，写 PDF 时按页替换 */
  readonly field?: FieldKind;
}

export type FieldKind = 'page' | 'pages';

export interface RectFill {
  readonly kind: 'rect';
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: Rgb;
}

export interface ImageDraw {
  readonly kind: 'image';
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly image: HTMLImageElement;
}

export interface LinkArea {
  readonly kind: 'link';
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

export type DrawOp = TextRun | RectFill | ImageDraw | LinkArea;

export interface ExtractOptions {
  readonly fragmenter: Fragmenter;
  /** 基线在字框里的相对位置（0~1，从顶边算），按字体类别和是否中日韩分别测过 */
  readonly baselineRatio: (family: FontFamilyClass, cjk: boolean) => number;
}

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'head',
  'title',
  'meta',
  'link',
  'svg',
  'video',
  'audio',
  'iframe',
  'object',
]);

export function parseColor(value: string): Rgb | null {
  if (value === '' || value === 'transparent') return null;
  const nums = value.match(/[\d.]+%?/g);
  if (nums === null || nums.length < 3) return null;
  const channel = (s: string): number =>
    s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s) / 255;
  const alpha = nums.length >= 4 ? parseFloat(nums[3]) : 1;
  if (alpha <= 0.02) return null;
  return [channel(nums[0]), channel(nums[1]), channel(nums[2])];
}

function transformText(text: string, mode: string): string {
  switch (mode) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase());
    default:
      return text;
  }
}

type CharClass = 'latin' | 'cjk' | 'skip';

function classifyChar(ch: string): CharClass {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x20) return 'latin';
  if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return 'skip';
  if (code >= 0xd800 && code <= 0xdfff) return 'skip';
  if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) return 'skip';
  return isWinAnsi(code) ? 'latin' : 'cjk';
}

interface Run {
  text: string;
  cjk: boolean;
  page: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface TextStyle {
  readonly size: number;
  readonly family: FontFamilyClass;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly color: Rgb;
  readonly letterSpacing: number;
  readonly transform: string;
  readonly pre: boolean;
  readonly justify: boolean;
}

export function extractOps(root: Element, options: ExtractOptions): DrawOp[] {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (view === null) return [];
  const ops: DrawOp[] = [];
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const styleOf = (el: Element): CSSStyleDeclaration => {
    let s = styles.get(el);
    if (s === undefined) {
      s = view.getComputedStyle(el);
      styles.set(el, s);
    }
    return s;
  };

  const textStyle = (el: Element): TextStyle => {
    const s = styleOf(el);
    const spacing = parseFloat(s.letterSpacing);
    return {
      size: parseFloat(s.fontSize) || 16,
      family: classifyFamily(s.fontFamily),
      bold: (parseInt(s.fontWeight, 10) || 400) >= 600,
      italic: s.fontStyle === 'italic' || s.fontStyle === 'oblique',
      color: parseColor(s.color) ?? [0, 0, 0],
      letterSpacing: Number.isFinite(spacing) ? spacing : 0,
      transform: s.textTransform,
      pre: s.whiteSpace.startsWith('pre'),
      justify: s.textAlign === 'justify' || s.textAlign === 'justify-all',
    };
  };

  const pushRun = (
    run: Run,
    style: TextStyle,
    underline: boolean,
    strike: boolean,
    field?: FieldKind,
  ): void => {
    const text = run.text;
    if (text.trim() === '') return;
    const rect = new DOMRect(run.left, run.top, run.right - run.left, run.bottom - run.top);
    const at = options.fragmenter.locate(rect);
    const ratio = options.baselineRatio(style.family, run.cjk);
    ops.push({
      kind: 'text',
      page: at.page,
      x: at.x,
      baseline: at.y + rect.height * ratio,
      width: rect.width,
      size: style.size,
      family: style.family,
      bold: style.bold,
      italic: style.italic,
      cjk: run.cjk,
      color: style.color,
      text,
      letterSpacing: style.letterSpacing,
      underline,
      strike,
      field,
    });
  };

  /** 逐字测量：换行、中西文切换、制表符、两端对齐的空格处都断开成新片段 */
  const scanRuns = (node: Text, style: TextStyle): Run[] => {
    const range = doc.createRange();
    const data = node.data;
    const runs: Run[] = [];
    let cur: Run | null = null;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      const cls = classifyChar(ch);
      if (cls === 'skip') {
        if (cur !== null) runs.push(cur);
        cur = null;
        continue;
      }
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      const ws = /\s/.test(ch);
      if (r.width === 0 && (ws || r.height === 0)) continue;
      const at = options.fragmenter.locate(r);
      // 空格跟着前一个片段的文种走；TS 在循环里把 cur 收窄成了 null，断言回真实类型
      const previous = cur as Run | null;
      const cjk: boolean = ws ? (previous?.cjk ?? false) : cls === 'cjk';
      const sameLine =
        cur !== null &&
        cur.page === at.page &&
        Math.min(cur.bottom, r.bottom) - Math.max(cur.top, r.top) >
          Math.min(cur.bottom - cur.top, r.height) * 0.5;
      // 两端对齐时浏览器会拉开字距，每个词（中日韩则每个字）单独定位
      const wordBreak = style.justify && (ws || cjk);
      if (!sameLine || cur === null || cur.cjk !== cjk || wordBreak) {
        if (cur !== null) runs.push(cur);
        if (style.justify && ws) {
          cur = null;
          continue;
        }
        cur = {
          text: '',
          cjk,
          page: at.page,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
        };
      }
      cur.text += transformText(ch, style.transform);
      cur.left = Math.min(cur.left, r.left);
      cur.top = Math.min(cur.top, r.top);
      cur.right = Math.max(cur.right, r.right);
      cur.bottom = Math.max(cur.bottom, r.bottom);
    }
    if (cur !== null) runs.push(cur);
    return runs;
  };

  const extractText = (node: Text, underline: boolean, strike: boolean): void => {
    const parent = node.parentElement;
    if (parent === null) return;
    const data = node.data;
    if (data.trim() === '') return;
    const style = textStyle(parent);
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) return;

    let allLatin = true;
    let allCjk = true;
    let hasSkip = false;
    for (const ch of data) {
      const cls = classifyChar(ch);
      if (cls === 'skip') hasSkip = true;
      else if (cls === 'cjk') allLatin = false;
      else if (ch !== ' ' && ch !== ' ') allCjk = false;
    }
    const fieldAttr = parent.closest('[data-lp-field]')?.getAttribute('data-lp-field');
    const field: FieldKind | undefined =
      fieldAttr === 'page' || fieldAttr === 'pages' ? fieldAttr : undefined;
    const simple = rects.length === 1 && (allLatin || allCjk) && !hasSkip && !style.justify;
    if (simple) {
      const text = style.pre ? data : data.replace(/\s+/g, ' ').trim();
      const r = rects[0];
      pushRun(
        {
          text: transformText(text, style.transform),
          cjk: !allLatin,
          page: 0,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
        },
        style,
        underline,
        strike,
        field,
      );
      return;
    }
    for (const run of scanRuns(node, style)) pushRun(run, style, underline, strike, field);
  };

  const rectOp = (r: DOMRectReadOnly, color: Rgb): void => {
    if (r.width <= 0 || r.height <= 0) return;
    const at = options.fragmenter.locate(r);
    ops.push({
      kind: 'rect',
      page: at.page,
      x: at.x,
      y: at.y,
      width: r.width,
      height: r.height,
      color,
    });
  };

  const decorate = (el: Element, s: CSSStyleDeclaration): void => {
    const rects = [...el.getClientRects()];
    if (rects.length === 0) return;
    const bg = parseColor(s.backgroundColor);
    if (bg !== null) for (const r of rects) rectOp(r, bg);
    const sides = [
      ['Top', s.borderTopWidth, s.borderTopStyle, s.borderTopColor],
      ['Right', s.borderRightWidth, s.borderRightStyle, s.borderRightColor],
      ['Bottom', s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor],
      ['Left', s.borderLeftWidth, s.borderLeftStyle, s.borderLeftColor],
    ] as const;
    for (const [side, widthText, styleText, colorText] of sides) {
      const width = parseFloat(widthText);
      if (!(width > 0) || styleText === 'none' || styleText === 'hidden') continue;
      const color = parseColor(colorText);
      if (color === null) continue;
      rects.forEach((r, i) => {
        // 跨页切开的块只在第一段画顶边、最后一段画底边
        if (side === 'Top' && i > 0) return;
        if (side === 'Bottom' && i < rects.length - 1) return;
        switch (side) {
          case 'Top':
            rectOp(new DOMRect(r.left, r.top, r.width, width), color);
            break;
          case 'Bottom':
            rectOp(new DOMRect(r.left, r.bottom - width, r.width, width), color);
            break;
          case 'Left':
            rectOp(new DOMRect(r.left, r.top, width, r.height), color);
            break;
          case 'Right':
            rectOp(new DOMRect(r.right - width, r.top, width, r.height), color);
            break;
        }
      });
    }
  };

  const walk = (node: Node, underline: boolean, strike: boolean): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      extractText(node as Text, underline, strike);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const s = styleOf(el);
    if (s.display === 'none' || s.visibility === 'hidden') return;

    if (tag === 'img') {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const at = options.fragmenter.locate(r);
        ops.push({
          kind: 'image',
          page: at.page,
          x: at.x,
          y: at.y,
          width: r.width,
          height: r.height,
          image: el as HTMLImageElement,
        });
      }
      return;
    }
    if (tag === 'input') {
      const input = el as HTMLInputElement;
      if (input.type === 'checkbox') {
        const r = el.getBoundingClientRect();
        const line: Rgb = [0.45, 0.45, 0.45];
        rectOp(new DOMRect(r.left, r.top, r.width, 1), line);
        rectOp(new DOMRect(r.left, r.bottom - 1, r.width, 1), line);
        rectOp(new DOMRect(r.left, r.top, 1, r.height), line);
        rectOp(new DOMRect(r.right - 1, r.top, 1, r.height), line);
        if (input.checked) {
          rectOp(new DOMRect(r.left + 3, r.top + 3, r.width - 6, r.height - 6), [0.2, 0.2, 0.2]);
        }
      }
      return;
    }

    decorate(el, s);
    const deco = s.textDecorationLine;
    const u = underline || deco.includes('underline');
    const k = strike || deco.includes('line-through');
    if (tag === 'a') {
      const href = (el as HTMLAnchorElement).href;
      if (/^https?:/i.test(href)) {
        for (const r of el.getClientRects()) {
          if (r.width <= 0 || r.height <= 0) continue;
          const at = options.fragmenter.locate(r);
          ops.push({
            kind: 'link',
            page: at.page,
            x: at.x,
            y: at.y,
            width: r.width,
            height: r.height,
            url: href,
          });
        }
      }
    }
    for (const child of el.childNodes) walk(child, u, k);
  };

  walk(root, false, false);
  return ops;
}

/**
 * 多栏分页：内容区固定高度、每栏一页宽，浏览器把放不下的内容排到右边的溢出栏里。
 * 元素矩形的横向偏移除以栏距就是页码。
 */
export function columnFragmenter(
  container: Element,
  columnWidth: number,
  gap: number,
  offsetX: number,
  offsetY: number,
): Fragmenter {
  const origin = container.getBoundingClientRect();
  const pitch = columnWidth + gap;
  return {
    locate: (rect) => {
      const rel = rect.left - origin.left;
      const page = Math.max(0, Math.floor((rel + 1) / pitch));
      return { page, x: rel - page * pitch + offsetX, y: rect.top - origin.top + offsetY };
    },
  };
}

/** 页眉页脚这类每页重复的内容：page 记为 -1，坐标相对容器加偏移 */
export function repeatingFragmenter(
  container: Element,
  offsetX: number,
  offsetY: number,
): Fragmenter {
  const origin = container.getBoundingClientRect();
  return {
    locate: (rect) => ({
      page: -1,
      x: rect.left - origin.left + offsetX,
      y: rect.top - origin.top + offsetY,
    }),
  };
}

/** 用一个零尺寸的 inline-block 探出基线在字框里的位置 */
export function measureBaselineRatio(doc: Document, fontFamily: string, cjk: boolean): number {
  const span = doc.createElement('span');
  span.style.cssText = `font: 100px ${fontFamily}; line-height: normal; position: absolute; left: 0; top: 0; visibility: hidden`;
  span.textContent = cjk ? '永字' : 'Hg';
  const marker = doc.createElement('span');
  marker.style.cssText = 'display: inline-block; width: 0; height: 0; vertical-align: baseline';
  span.append(marker);
  doc.body.append(span);
  const sr = span.getBoundingClientRect();
  const mr = marker.getBoundingClientRect();
  span.remove();
  const ratio = sr.height > 0 ? (mr.top - sr.top) / sr.height : 0.8;
  return ratio > 0.5 && ratio < 1 ? ratio : 0.8;
}
