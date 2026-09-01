import type { ConvertOptions } from '../core/contracts/options.ts';
import type { ConversionProgress, ConversionReport } from '../core/contracts/report.ts';

export type WorkerErrorCode =
  | 'cancelled'
  | 'password-required'
  | 'password-incorrect'
  | 'invalid-pdf'
  | 'unknown';

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
      readonly blob: Blob;
      readonly fileName: string;
      readonly report: ConversionReport;
    }
  | {
      readonly type: 'error';
      readonly jobId: string;
      readonly code: WorkerErrorCode;
      readonly message: string;
    };
