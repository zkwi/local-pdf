import type { PrimitivePage, PrimitiveTextSpan, TextHealth } from '../contracts/primitives.ts';
import type { OcrPolicy } from '../contracts/options.ts';
import type { MessageParams } from '../contracts/report.ts';

export type OcrProgressKey = 'ocr-model-download' | 'ocr-model-init' | 'ocr-model-ready';

export interface OcrProgress {
  readonly key: OcrProgressKey;
  /** 0~1；不知道进度时为 -1 */
  readonly progress: number;
  readonly params?: MessageParams;
}

export interface OcrEngine {
  /** 报告里显示的引擎描述，如 "PaddleOCR PP-OCRv6 tiny" */
  readonly name: string;
  recognize(
    canvas: OffscreenCanvas,
    scale: number,
    pageIndex: number,
  ): Promise<PrimitiveTextSpan[]>;
  terminate(): Promise<void>;
}

export interface OcrEngineContext {
  /** 应用静态资源根（以 / 结尾），用来找自托管的 ORT wasm 与模型 */
  readonly assetBase: string;
  readonly onProgress?: (progress: OcrProgress) => void;
  readonly signal?: AbortSignal;
}

/**
 * 是否对这一页做 OCR。逐页判断而不是整份文档二选一，
 * 因为"扫描件里夹着几页原生文字"和"原生文档里夹着几页扫描"都很常见。
 */
export function shouldRunOcr(page: PrimitivePage, policy: OcrPolicy): boolean {
  if (policy === 'off') return false;
  if (policy === 'force') return true;
  const health: TextHealth = page.textHealth;
  if (health.charCount === 0 && health.imageCoverage > 0.1) return true;
  if (health.charCount < 24 && health.imageCoverage > 0.35) return true;
  return health.suspicious;
}

/** OCR 结果和原生文字合并时，位置重叠的原生片段优先保留 */
export function mergeOcrSpans(
  native: readonly PrimitiveTextSpan[],
  ocr: readonly PrimitiveTextSpan[],
): PrimitiveTextSpan[] {
  if (native.length === 0) return [...ocr];
  const kept = ocr.filter((o) => {
    const ocx = o.bbox.x + o.bbox.width / 2;
    const ocy = o.bbox.y + o.bbox.height / 2;
    return !native.some(
      (n) =>
        ocx >= n.bbox.x &&
        ocx <= n.bbox.x + n.bbox.width &&
        ocy >= n.bbox.y &&
        ocy <= n.bbox.y + n.bbox.height,
    );
  });
  return [...native, ...kept];
}
