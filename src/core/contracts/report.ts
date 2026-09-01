import type { ConversionWarning } from './layout.ts';

export type ConversionStage =
  | 'queued'
  | 'loading'
  | 'extracting'
  | 'ocr'
  | 'analyzing'
  | 'writing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ConversionProgress {
  readonly stage: ConversionStage;
  readonly pageIndex?: number;
  readonly totalPages?: number;
  /** 0~1 */
  readonly fraction: number;
  readonly message: string;
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
}

export interface ConversionResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly report: ConversionReport;
}
