import type { BBox } from './geometry.ts';
import type { ConversionWarning, ImageFormat } from './layout.ts';
import type { DocumentMetadata } from './primitives.ts';

/** 块在原 PDF 里的出处，供 Markdown manifest 和后续诊断预览回溯用 */
export interface BlockOrigin {
  readonly pageIndex: number;
  readonly bbox: BBox;
  readonly confidence: number;
  readonly ocr: boolean;
}

export interface SemanticRun {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  /** 半磅单位由 writer 负责换算，这里保持 pt */
  readonly fontSize: number;
  readonly fontFamily?: string;
  /** PDF 里的真实字体名，writer 用它做字体映射 */
  readonly fontName?: string;
  /** 页码等由 Word 计算的域；有值时忽略 text */
  readonly field?: 'page-number';
}

export interface SemanticParagraph {
  readonly kind: 'paragraph';
  readonly runs: readonly SemanticRun[];
  readonly alignment: 'left' | 'center' | 'right' | 'justify';
  readonly firstLineIndentPt: number;
  readonly spaceBeforePt: number;
  readonly spaceAfterPt: number;
  readonly lineSpacing: number;
  /**
   * exact：行距是从多行段落量出来的基线间距，照原样排；
   * atLeast（默认）：行距只是估计，让 Word 按字体自己的行高再撑开
   */
  readonly lineRule?: 'exact' | 'atLeast';
  readonly sourceElementIds: readonly string[];
  readonly origin?: BlockOrigin;
}

export interface SemanticHeading {
  readonly kind: 'heading';
  readonly level: 1 | 2 | 3 | 4;
  readonly runs: readonly SemanticRun[];
  /** 量出来的段后距；原文里标题前后的空白已经在相邻块的间距里，不再另加 */
  readonly spaceAfterPt?: number;
  readonly sourceElementIds: readonly string[];
  readonly origin?: BlockOrigin;
}

export interface SemanticListItem {
  readonly kind: 'list-item';
  readonly ordered: boolean;
  readonly level: number;
  readonly runs: readonly SemanticRun[];
  /** 有值时不用 Word 自动编号，直接把原标记写进正文 */
  readonly literalMarker?: string;
  readonly sourceElementIds: readonly string[];
  readonly origin?: BlockOrigin;
}

export interface SemanticTableCell {
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly blocks: readonly (SemanticParagraph | SemanticHeading | SemanticListItem)[];
}

export interface SemanticTableRow {
  readonly cells: readonly SemanticTableCell[];
}

export interface SemanticTable {
  readonly kind: 'table';
  readonly rows: readonly SemanticTableRow[];
  readonly columnWidthsPt: readonly number[];
  readonly bordered: boolean;
  readonly sourceElementIds: readonly string[];
  readonly origin?: BlockOrigin;
}

export interface SemanticImage {
  readonly kind: 'image';
  readonly data: Uint8Array;
  readonly format: ImageFormat;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly sourceElementIds: readonly string[];
  readonly origin?: BlockOrigin;
}

export interface SemanticPageBreak {
  readonly kind: 'page-break';
}

export type SemanticBlock =
  | SemanticParagraph
  | SemanticHeading
  | SemanticListItem
  | SemanticTable
  | SemanticImage
  | SemanticPageBreak;

export interface SemanticSection {
  readonly pageWidthPt: number;
  readonly pageHeightPt: number;
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly header: readonly SemanticParagraph[];
  readonly footer: readonly SemanticParagraph[];
  readonly blocks: readonly SemanticBlock[];
}

export interface SemanticDocument {
  readonly metadata: DocumentMetadata;
  readonly sections: readonly SemanticSection[];
  readonly warnings: readonly ConversionWarning[];
  readonly defaultFontSizePt: number;
}
