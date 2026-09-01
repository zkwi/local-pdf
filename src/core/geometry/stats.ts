export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

/** 按 bucket 量化后的众数，用于估计正文字号 */
export function mode(values: readonly number[], bucket = 0.5): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of values) {
    const key = Math.round(v / bucket) * bucket;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && key < best)) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/** 一维值聚类：相邻差值小于 tolerance 归为一簇，返回每簇的代表值与成员下标 */
export function cluster1D(
  values: readonly number[],
  tolerance: number,
): { value: number; indices: number[] }[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out: { value: number; indices: number[] }[] = [];
  let current: { sum: number; indices: number[]; last: number } | null = null;
  for (const { v, i } of order) {
    if (current !== null && v - current.last <= tolerance) {
      current.sum += v;
      current.indices.push(i);
      current.last = v;
    } else {
      if (current !== null) out.push({ value: current.sum / current.indices.length, indices: current.indices });
      current = { sum: v, indices: [i], last: v };
    }
  }
  if (current !== null) out.push({ value: current.sum / current.indices.length, indices: current.indices });
  return out;
}
