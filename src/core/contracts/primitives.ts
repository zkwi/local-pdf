import type { BBox } from './geometry.ts';

export type TextSource = 'native-pdf' | 'ocr';

/**
 * 第一层：忠实保存 PDF 抽取结果，不做任何版面推断。
 * 这一层的任何字段都可以被回溯到具体的 PDF 绘制指令。
 */
export interface PrimitiveTextSpan {
  readonly id: string;
  readonly pageIndex: number;
  readonly text: string;
  readonly bbox: BBox;
  /** 基线的设备坐标 y，行聚类主要依赖它而不是 bbox.y */
  readonly baseline: number;
  readonly fontSize: number;
  /** pdf.js 内部字体键，用于回溯 */
  readonly fontKey: string;
  readonly fontName: string;
  readonly fontFamily: string;
  readonly bold: boolean;
  readonly italic: boolean;
  /** 顺时针角度，已归一到 [0, 360) */
  readonly rotation: number;
  readonly vertical: boolean;
  readonly source: TextSource;
  readonly confidence: number;
  readonly hasEOL: boolean;
}

export interface PrimitiveImage {
  readonly id: string;
  readonly pageIndex: number;
  readonly bbox: BBox;
  readonly isMask: boolean;
}

/** 轴对齐直线段，来自矢量路径，用于有线表格识别 */
export interface PrimitiveSegment {
  readonly id: string;
  readonly pageIndex: number;
  readonly orientation: 'horizontal' | 'vertical';
  /** 沿线方向的起止（horizontal 时是 x，vertical 时是 y） */
  readonly start: number;
  readonly end: number;
  /** 垂直于线方向的位置（horizontal 时是 y，vertical 时是 x） */
  readonly position: number;
  readonly thickness: number;
}

export interface PrimitiveLink {
  readonly id: string;
  readonly pageIndex: number;
  readonly bbox: BBox;
  readonly url: string;
}

/** 页面文本健康度，决定是否触发 OCR */
export interface TextHealth {
  readonly charCount: number;
  /** 可打印字符占比 */
  readonly printableRatio: number;
  /** U+FFFD 等替换字符占比 */
  readonly replacementRatio: number;
  /** 图像覆盖面积 / 页面面积 */
  readonly imageCoverage: number;
  /** 文本覆盖面积 / 页面面积 */
  readonly textCoverage: number;
  readonly suspicious: boolean;
}

export interface PrimitivePage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  /** 页面自身的 /Rotate，坐标已按它归一化，这里只作记录 */
  readonly rotation: number;
  readonly spans: readonly PrimitiveTextSpan[];
  readonly images: readonly PrimitiveImage[];
  readonly segments: readonly PrimitiveSegment[];
  readonly links: readonly PrimitiveLink[];
  readonly textHealth: TextHealth;
  /** 该页是否走过 OCR */
  readonly ocrApplied: boolean;
}

export interface DocumentMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly creator?: string;
  readonly producer?: string;
  readonly pageCount: number;
  readonly sourceFileName: string;
}

export interface PrimitiveDocument {
  readonly metadata: DocumentMetadata;
  readonly pages: readonly PrimitivePage[];
}
