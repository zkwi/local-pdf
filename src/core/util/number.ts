/** 取整后夹到 [min, max]；不是有限数（NaN、Infinity、空输入）时用 fallback */
export function clampInt(value: number, min: number, max: number, fallback = min): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
