import type { ConversionWarning } from './layout.ts';

export type ConversionStage =
  | 'queued'
  | 'loading'
  | 'extracting'
  /** 图片模式：逐页渲染 */
  | 'rendering'
  | 'ocr-model'
  | 'ocr'
  | 'analyzing'
  | 'writing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * 进度文案的键。核心层不拼任何自然语言，界面按当前语言渲染。
 * params 里的页码从 1 起，方便直接显示。
 */
export type ProgressKey =
  | 'queued'
  | 'loading'
  | 'extracting'
  | 'rendering'
  | 'ocr-model-download'
  | 'ocr-model-init'
  | 'ocr-model-ready'
  | 'ocr'
  | 'analyzing'
  | 'writing-docx'
  | 'writing-markdown'
  | 'writing-images'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MessageParams = Readonly<Record<string, string | number>>;

export interface ConversionProgress {
  readonly stage: ConversionStage;
  readonly pageIndex?: number;
  readonly totalPages?: number;
  /** 文档真实页数；超过 maxPages 时比 totalPages 大，界面据此提前告知只转前几页 */
  readonly documentPages?: number;
  /** 0~1 */
  readonly fraction: number;
  readonly key: ProgressKey;
  readonly params?: MessageParams;
}

export interface PageReport {
  readonly index: number;
  readonly confidence: number;
  readonly columnCount: number;
  readonly paragraphs: number;
  readonly headings: number;
  readonly listItems: number;
  readonly tables: number;
  readonly images: number;
  readonly characters: number;
  readonly ocrApplied: boolean;
  readonly warnings: readonly ConversionWarning[];
}

export interface ConversionReport {
  readonly fileName: string;
  readonly pageCount: number;
  readonly pages: readonly PageReport[];
  readonly warnings: readonly ConversionWarning[];
  readonly durationByStage: Readonly<Record<string, number>>;
  readonly totalDurationMs: number;
  /** 实际用到的 OCR 引擎描述，没做 OCR 时为空 */
  readonly ocrEngine?: string;
}

/**
 * markdown：单个 .md；markdown-bundle：带图片和 manifest 的 zip；
 * image：单页文档的一张图；image-bundle：每页一张图的 zip
 */
export type OutputKind = 'docx' | 'markdown' | 'markdown-bundle' | 'image' | 'image-bundle';

export interface ConversionOutput {
  readonly kind: OutputKind;
  readonly blob: Blob;
  readonly fileName: string;
}

export interface ConversionResult {
  readonly outputs: readonly ConversionOutput[];
  readonly report: ConversionReport;
}
