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
  // 整页是图、文字层只有水印 / 页眉页脚 / 页码的，是带水印的扫描页
  if (
    health.imageCoverage > 0.6 &&
    health.charCount < 300 &&
    page.spans.length > 0 &&
    isDecorativeText(page)
  ) {
    return true;
  }
  return health.suspicious;
}

/** 页眉页脚区：上下各占页高的这个比例 */
const MARGIN_RATIO = 0.08;

/** 每个文字片段都是旋转的（水印）或落在上下边缘（页眉、页脚、页码），正文区一个字都没有 */
function isDecorativeText(page: PrimitivePage): boolean {
  const top = page.height * MARGIN_RATIO;
  const bottom = page.height * (1 - MARGIN_RATIO);
  return page.spans.every(
    (s) => s.rotation !== 0 || s.bbox.y + s.bbox.height <= top || s.bbox.y >= bottom,
  );
}

/**
 * 自带文字层的扫描页（"可搜索 PDF"）：文字全是不可见的，而且不是零星几个标签。
 * 这种页按文字层输出，整页扫描图不再保留，和自己 OCR 过的页一致。
 */
export function isScanWithTextLayer(page: PrimitivePage): boolean {
  return page.textHealth.hiddenText && !isSparseOcr(page.spans);
}

/** 与主流字号相差不到这么多的都当同一个字号（OCR 框高的抖动大约 ±25%） */
const SNAP_TOLERANCE = 0.35;
/** 比主流字号大这么多倍以上的一律压下来：图表里被拉成整块的标签，不是真的大字 */
const MAX_SIZE_RATIO = 3;

/**
 * OCR 来的文字（自己识别的，或文件自带的文字层）字号是从框高估的，同一段里每行都不一样：
 * 版面分析会把段落一行行拆开、把稍大的行当标题，Word 里字号也忽大忽小。
 * 按字符数加权取主流字号，附近的一律吸附过去，离谱的大字压到上限。
 */
export function snapFontSizes(spans: readonly PrimitiveTextSpan[]): PrimitiveTextSpan[] {
  const weighted = spans
    .map((s) => ({ size: s.fontSize, chars: s.text.trim().length }))
    .filter((w) => w.chars > 0 && w.size > 0)
    .sort((a, b) => a.size - b.size);
  if (weighted.length === 0) return [...spans];
  const half = weighted.reduce((sum, w) => sum + w.chars, 0) / 2;
  let acc = 0;
  let dominant = weighted[weighted.length - 1].size;
  for (const w of weighted) {
    acc += w.chars;
    if (acc >= half) {
      dominant = w.size;
      break;
    }
  }
  return spans.map((s) => {
    const ratio = s.fontSize / dominant;
    if (Math.abs(ratio - 1) < SNAP_TOLERANCE) {
      return s.fontSize === dominant ? s : { ...s, fontSize: dominant };
    }
    if (ratio > MAX_SIZE_RATIO) return { ...s, fontSize: dominant * MAX_SIZE_RATIO };
    return s;
  });
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

/**
 * 自动模式下判断一页 OCR 结果是不是"图表/封面上的零星标签"而不是正文：
 * 字太少，或者字不多且每行都很短（坐标轴刻度、图例这类）。
 * 是的话保留原图，不把几十个标签当段落塞进 Word。
 */
export function isSparseOcr(spans: readonly PrimitiveTextSpan[]): boolean {
  const lengths = spans.map((s) => s.text.trim().length).filter((n) => n > 0);
  const chars = lengths.reduce((a, b) => a + b, 0);
  if (chars < 40) return true;
  if (chars >= 300) return false;
  const sorted = [...lengths].sort((a, b) => a - b);
  const medianLen = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return medianLen <= 6;
}
