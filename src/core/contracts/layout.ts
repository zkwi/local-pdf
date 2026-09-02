import type { BBox } from './geometry.ts';
import type { PrimitiveTextSpan } from './primitives.ts';

/**
 * decimal / letter 可以交给 Word 自动编号，
 * other（中文数字、圆圈数字、带括号编号）必须保留原样，否则会被 Word 改写成 1. 2. 3.
 */
export type ListMarkerStyle = 'bullet' | 'decimal' | 'letter' | 'other';

export type WarningCode =
  | 'encrypted-pdf'
  | 'page-extract-failed'
  | 'page-render-failed'
  | 'page-render-downscaled'
  | 'image-extract-failed'
  | 'operator-list-failed'
  | 'low-confidence-reading-order'
  | 'low-confidence-table'
  | 'table-dropped'
  | 'ocr-applied'
  | 'ocr-failed'
  | 'ocr-skipped'
  | 'ocr-sparse-kept-image'
  | 'ocr-model-unverified'
  | 'markdown-table-html'
  | 'rotated-text-flattened'
  | 'vertical-text-flattened'
  | 'font-substituted'
  | 'page-limit-exceeded'
  | 'page-size-clamped'
  | 'no-text-found';

/**
 * 警告只带 code 和插值参数，不带自然语言，由界面按当前语言渲染。
 * params 里的 page 从 1 起；reason 是原始错误文本（不翻译）。
 */
export interface ConversionWarning {
  readonly code: WarningCode;
  readonly pageIndex?: number;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** 一行文本：由若干 span 在同一基线上聚合而成 */
export interface TextLine {
  readonly id: string;
  readonly pageIndex: number;
  readonly text: string;
  readonly bbox: BBox;
  readonly baseline: number;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly fontName: string;
  readonly spanIds: readonly string[];
  readonly spans: readonly PrimitiveTextSpan[];
}

export interface LayoutMetadata {
  readonly pageIndex: number;
  readonly bbox: BBox;
  readonly readingOrder: number;
  /** 0~1，越低越需要人工确认 */
  readonly confidence: number;
  readonly sourceElementIds: readonly string[];
}

export interface ParagraphBlock {
  readonly kind: 'paragraph';
  readonly meta: LayoutMetadata;
  readonly lines: readonly TextLine[];
  /** 首行缩进（pt），负值表示悬挂缩进 */
  readonly firstLineIndent: number;
  readonly alignment: 'left' | 'center' | 'right' | 'justify';
}

export interface HeadingBlock {
  readonly kind: 'heading';
  readonly meta: LayoutMetadata;
  readonly level: 1 | 2 | 3 | 4;
  readonly lines: readonly TextLine[];
}

export interface ListItemBlock {
  readonly kind: 'list-item';
  readonly meta: LayoutMetadata;
  readonly ordered: boolean;
  readonly marker: string;
  /** 'other' 表示 Word 自动编号无法还原，需要保留原始标记文本 */
  readonly markerStyle: ListMarkerStyle;
  readonly level: number;
  readonly lines: readonly TextLine[];
}

export interface TableCell {
  readonly row: number;
  readonly col: number;
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly bbox: BBox;
  readonly lines: readonly TextLine[];
}

export interface TableBlock {
  readonly kind: 'table';
  readonly meta: LayoutMetadata;
  readonly rows: number;
  readonly cols: number;
  /** 各列宽度（pt），长度等于 cols */
  readonly columnWidths: readonly number[];
  readonly cells: readonly TableCell[];
  readonly bordered: boolean;
}

export type ImageFormat = 'png' | 'jpeg';

export interface ImageBlock {
  readonly kind: 'image';
  readonly meta: LayoutMetadata;
  readonly data: Uint8Array;
  readonly format: ImageFormat;
  readonly widthPt: number;
  readonly heightPt: number;
}

export interface HeaderFooterBlock {
  readonly kind: 'header' | 'footer';
  readonly meta: LayoutMetadata;
  readonly lines: readonly TextLine[];
}

export type LayoutBlock =
  ParagraphBlock | HeadingBlock | ListItemBlock | TableBlock | ImageBlock | HeaderFooterBlock;

export interface LayoutPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly columnCount: number;
  readonly blocks: readonly LayoutBlock[];
  readonly header: HeaderFooterBlock | null;
  readonly footer: HeaderFooterBlock | null;
  readonly confidence: number;
  readonly warnings: readonly ConversionWarning[];
}

export interface LayoutDocument {
  readonly pages: readonly LayoutPage[];
  readonly warnings: readonly ConversionWarning[];
  /** 正文字号（众数），供上层做相对判断 */
  readonly bodyFontSize: number;
}
