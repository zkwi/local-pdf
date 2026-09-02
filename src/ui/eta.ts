import type { ConversionProgress } from '../core/contracts/report.ts';

/** 每翻一页记一个采样点：page 是已完成的页数，at 是时间戳 */
export interface PageSample {
  readonly page: number;
  readonly at: number;
}

/** 只看最近这段时间的页速：扫描页夹在原生页后面时，整体平均会严重低估剩余时间 */
const WINDOW_MS = 60_000;
/** 页很慢时窗口里凑不齐几个点，至少留这么多 */
const MIN_SAMPLES = 4;
/** 兜底上限，页快到极端时数组也不会无限长 */
export const MAX_SAMPLES = 600;
/** 采样跨度不到这个时长不给估计：短任务用不着，头几页也抖得厉害 */
const MIN_SPAN_MS = 5000;

export function pushSample(
  samples: readonly PageSample[],
  page: number,
  at: number,
): readonly PageSample[] {
  const last = samples[samples.length - 1];
  if (last !== undefined && page <= last.page) return samples;
  const next = [...samples, { page, at }];
  // 新点本身就在窗口里，所以 findIndex 不会是 -1
  const inWindow = next.findIndex((s) => s.at >= at - WINDOW_MS);
  const start = Math.max(
    0,
    Math.min(inWindow, next.length - MIN_SAMPLES),
    next.length - MAX_SAMPLES,
  );
  return start > 0 ? next.slice(start) : next;
}

/** 估算剩余毫秒数；不在逐页阶段或数据不够时返回 null */
export function estimateRemainingMs(
  progress: ConversionProgress,
  samples: readonly PageSample[],
  now: number,
): number | null {
  if (progress.totalPages === undefined) return null;
  if (
    progress.stage !== 'extracting' &&
    progress.stage !== 'ocr' &&
    progress.stage !== 'ocr-model'
  ) {
    return null;
  }
  if (samples.length < MIN_SAMPLES) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return null;
  const pages = last.page - first.page;
  const span = last.at - first.at;
  if (pages <= 0 || span < MIN_SPAN_MS) return null;
  const perPage = span / pages;
  // 当前页已经花掉的时间也扣掉，慢页上剩余时间才不会一直不动
  return Math.max(0, (progress.totalPages - last.page) * perPage - (now - last.at));
}

/** 0:07、12:34、1:02:03 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
