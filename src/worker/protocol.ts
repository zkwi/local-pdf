import type { ConvertOptions } from '../core/contracts/options.ts';
import type {
  ConversionOutput,
  ConversionProgress,
  ConversionReport,
} from '../core/contracts/report.ts';

export type WorkerErrorCode =
  'cancelled' | 'password-required' | 'password-incorrect' | 'invalid-pdf' | 'unknown';

export interface WorkerError {
  readonly code: WorkerErrorCode;
  /** 原始错误文本，只在 unknown 时有意义，界面原样附在译文后面 */
  readonly detail?: string;
}

export type WorkerRequest =
  | {
      readonly type: 'convert';
      readonly jobId: string;
      readonly buffer: ArrayBuffer;
      readonly fileName: string;
      readonly options: ConvertOptions;
      readonly assetBase: string;
    }
  | { readonly type: 'cancel'; readonly jobId: string };

export type WorkerResponse =
  | { readonly type: 'progress'; readonly jobId: string; readonly progress: ConversionProgress }
  | {
      readonly type: 'done';
      readonly jobId: string;
      readonly outputs: readonly ConversionOutput[];
      readonly report: ConversionReport;
    }
  | { readonly type: 'error'; readonly jobId: string; readonly error: WorkerError };
