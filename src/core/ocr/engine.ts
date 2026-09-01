import type { PrimitivePage, PrimitiveTextSpan, TextHealth } from '../contracts/primitives.ts';
import type { OcrPolicy } from '../contracts/options.ts';

export interface OcrProgress {
  readonly status: string;
  readonly progress: number;
}

export interface OcrEngine {
  recognize(
    canvas: OffscreenCanvas,
    scale: number,
    pageIndex: number,
  ): Promise<PrimitiveTextSpan[]>;
  terminate(): Promise<void>;
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
