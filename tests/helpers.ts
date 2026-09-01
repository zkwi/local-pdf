import type { PrimitiveSegment, PrimitiveTextSpan } from '../src/core/contracts/primitives.ts';

let seq = 0;

export interface SpanInit {
  readonly text: string;
  readonly x: number;
  readonly baseline: number;
  readonly fontSize?: number;
  readonly width?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly pageIndex?: number;
  readonly fontName?: string;
}

/** 造一个假的文本 span：宽度默认按 0.55em/字 估，够行聚类和间距规则用 */
export function span(init: SpanInit): PrimitiveTextSpan {
  const fontSize = init.fontSize ?? 10;
  const width = init.width ?? init.text.length * fontSize * 0.55;
  return {
    id: `s${seq++}`,
    pageIndex: init.pageIndex ?? 0,
    text: init.text,
    bbox: { x: init.x, y: init.baseline - fontSize * 0.8, width, height: fontSize },
    baseline: init.baseline,
    fontSize,
    fontKey: 'f1',
    fontName: init.fontName ?? 'Test',
    fontFamily: 'serif',
    bold: init.bold ?? false,
    italic: init.italic ?? false,
    rotation: 0,
    vertical: false,
    source: 'native-pdf',
    confidence: 1,
    hasEOL: false,
  };
}

/** 整行（单 span）快捷构造 */
export function line(
  text: string,
  x: number,
  baseline: number,
  width: number,
  extra: Partial<SpanInit> = {},
): PrimitiveTextSpan {
  return span({ text, x, baseline, width, ...extra });
}

export function hRule(y: number, x0: number, x1: number, pageIndex = 0): PrimitiveSegment {
  return {
    id: `h${seq++}`,
    pageIndex,
    orientation: 'horizontal',
    start: x0,
    end: x1,
    position: y,
    thickness: 1,
  };
}

export function vRule(x: number, y0: number, y1: number, pageIndex = 0): PrimitiveSegment {
  return {
    id: `v${seq++}`,
    pageIndex,
    orientation: 'vertical',
    start: y0,
    end: y1,
    position: x,
    thickness: 1,
  };
}
