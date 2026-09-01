import type { ConversionWarning } from './layout.ts';
import type { DocumentMetadata } from './primitives.ts';

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
  readonly sourceElementIds: readonly string[];
}

export interface SemanticHeading {
  readonly kind: 'heading';
  readonly level: 1 | 2 | 3 | 4;
  readonly runs: readonly SemanticRun[];
  readonly sourceElementIds: readonly string[];
}

export interface SemanticListItem {
  readonly kind: 'list-item';
  readonly ordered: boolean;
  readonly level: number;
  readonly runs: readonly SemanticRun[];
  /** 有值时不用 Word 自动编号，直接把原标记写进正文 */
  readonly literalMarker?: string;
  readonly sourceElementIds: readonly string[];
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
}

export interface SemanticImage {
  readonly kind: 'image';
  readonly data: Uint8Array;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly sourceElementIds: readonly string[];
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
  readonly margins: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
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
