/**
 * 把 RGBA 像素减到不超过 maxColors 种颜色（类似 pngquant 的有损 PNG 压缩）。
 *
 * 1. 先把颜色按 RGB 各 5 位、不透明度 4 位分桶统计（完全透明的像素单独一桶），
 *    不透明的图最多 32768 桶，后面的聚类只在桶上做，和像素数无关；
 * 2. 中位切分：反复把加权误差最大的盒子沿方差最大的通道从加权中位数处切开；
 * 3. 在桶上做几轮 k-means 微调，颜色取桶内真实像素的均值，不会被桶的粗粒度拉偏；
 * 4. 映射回像素，可选 Floyd–Steinberg 抖动：只抖细腻的过渡处，渐变不出色带，
 *    平整色块和硬边缘不抖，不撒噪点（截图类 PNG 小一半以上）。
 *
 * 距离在预乘不透明度的空间里算：完全透明的像素颜色无所谓，半透明边缘按看到的样子比较。
 */

export interface QuantizeResult {
  /** 调色板，每项 RGBA 四个字节，未预乘 */
  readonly palette: Uint8Array;
  readonly count: number;
  /** 每个像素的调色板下标 */
  readonly indices: Uint8Array;
}

export interface QuantizeOptions {
  /** 抖动强度 0～1，0 表示不抖动 */
  readonly dither: number;
}

const BUCKETS = (1 << 19) + 1;
/** 通道权重：人眼对绿最敏感、蓝最不敏感；不透明度错了边缘会发毛，给高一点 */
const WR = 0.9;
const WG = 1.2;
const WB = 0.6;
const WA = 1.4;

function bucketOf(r: number, g: number, b: number, a: number): number {
  if (a === 0) return 0;
  return 1 + (((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4));
}

interface Box {
  /** 在 order 里的区间 [start, end) */
  readonly start: number;
  readonly end: number;
  readonly error: number;
  readonly channel: number;
}

export function quantize(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxColors: number,
  options: QuantizeOptions,
): QuantizeResult {
  const pixels = width * height;
  const bucketIndex = new Int32Array(BUCKETS).fill(-1);
  const counts: number[] = [];
  // 第一遍：数桶
  let used = 0;
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    const key = bucketOf(data[i], data[i + 1], data[i + 2], data[i + 3]);
    let idx = bucketIndex[key];
    if (idx < 0) {
      idx = used++;
      bucketIndex[key] = idx;
      counts.push(0);
    }
    counts[idx]++;
  }
  // 第二遍：桶内像素的预乘颜色之和，均值就是桶的代表色
  const n = used;
  const weight = new Float64Array(n);
  const sum = new Float64Array(n * 4);
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    const a = data[i + 3];
    const idx = bucketIndex[bucketOf(data[i], data[i + 1], data[i + 2], a)];
    const k = a / 255;
    weight[idx]++;
    sum[idx * 4] += data[i] * k;
    sum[idx * 4 + 1] += data[i + 1] * k;
    sum[idx * 4 + 2] += data[i + 2] * k;
    sum[idx * 4 + 3] += a;
  }
  const mean = new Float64Array(n * 4);
  for (let j = 0; j < n * 4; j++) mean[j] = sum[j] / weight[j >> 2];

  // 完全透明的桶单独占一个调色板位置，保证透明区域原样透明
  const transparent = bucketIndex[0];
  const order: number[] = [];
  for (let j = 0; j < n; j++) if (j !== transparent) order.push(j);
  const budget = Math.max(1, maxColors - (transparent >= 0 ? 1 : 0));

  const boxes = order.length === 0 ? [] : medianCut(order, mean, weight, budget);
  let centers = boxes.map((box) => boxMean(order, box, mean, weight));
  centers = refine(order, mean, weight, centers, n * centers.length > 40_000_000 ? 1 : 3);

  const count = centers.length + (transparent >= 0 ? 1 : 0);
  const palette = new Uint8Array(count * 4);
  // 预乘颜色 → 未预乘的调色板
  const pre = new Float64Array(count * 4);
  for (let c = 0; c < centers.length; c++) {
    const [r, g, b, a] = centers[c];
    pre.set([r, g, b, a], c * 4);
    const alpha = Math.max(1, Math.round(a));
    const k = 255 / alpha;
    palette[c * 4] = clampByte(r * k);
    palette[c * 4 + 1] = clampByte(g * k);
    palette[c * 4 + 2] = clampByte(b * k);
    palette[c * 4 + 3] = clampByte(a);
  }
  const transparentIndex = transparent >= 0 ? centers.length : -1;

  const indices = new Uint8Array(pixels);
  const nearest = (r: number, g: number, b: number, a: number): number => {
    let best = 0;
    let bestDistance = Infinity;
    for (let c = 0; c < centers.length; c++) {
      const o = c * 4;
      const dr = pre[o] - r;
      const dg = pre[o + 1] - g;
      const db = pre[o + 2] - b;
      const da = pre[o + 3] - a;
      const d = WR * dr * dr + WG * dg * dg + WB * db * db + WA * da * da;
      if (d < bestDistance) {
        bestDistance = d;
        best = c;
      }
    }
    return best;
  };

  /** 按桶取颜色：桶的代表色（桶内像素均值）最近的那个，一大片同色的地方整片取同一个颜色 */
  const ofBucket = new Int16Array(BUCKETS).fill(-1);
  const sourceIndex = (i: number): number => {
    const key = bucketOf(data[i], data[i + 1], data[i + 2], data[i + 3]);
    let c = ofBucket[key];
    if (c < 0) {
      const idx = bucketIndex[key];
      c = nearest(mean[idx * 4], mean[idx * 4 + 1], mean[idx * 4 + 2], mean[idx * 4 + 3]);
      ofBucket[key] = c;
    }
    return c;
  };

  if (options.dither <= 0) {
    for (let p = 0, i = 0; p < pixels; p++, i += 4) {
      indices[p] = data[i + 3] === 0 && transparentIndex >= 0 ? transparentIndex : sourceIndex(i);
    }
    return { palette, count, indices };
  }

  // Floyd–Steinberg：误差在未预乘的 RGB 上扩散，按不透明度折算，透明处不传播
  const strength = Math.min(1, options.dither);
  const ofDithered = new Int16Array(BUCKETS).fill(-1);
  const row = width * 4;
  let current = new Float32Array((width + 2) * 3);
  let next = new Float32Array((width + 2) * 3);
  // 和下边像素的差：这一行算好，下一行当「和上边的差」用，每对相邻像素只比一次
  let above = new Uint8Array(width);
  let below = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    next.fill(0);
    let left = 0;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const right = x + 1 < width ? channelDiff(data, i, i + 4) : 0;
      below[x] = y + 1 < height ? channelDiff(data, i, i + row) : 0;
      const contrast = Math.max(left, right, above[x], below[x]);
      left = right;
      const a = data[i + 3];
      if (a === 0 && transparentIndex >= 0) {
        indices[p] = transparentIndex;
        continue;
      }
      // 只在细腻的过渡处（照片、渐变）抖动。和上下左右完全同色的平整处，抖了只会撒出噪点，
      // 截图、图表这类图的 PNG 能大两三倍；反差很大的边缘（文字、轮廓）抖了会发毛。
      // 这两种地方直接取最近的颜色，上游传来的误差也不接
      if (contrast === 0 || contrast > EDGE) {
        indices[p] = sourceIndex(i);
        continue;
      }
      const e = (x + 1) * 3;
      const r = clampByte(data[i] + current[e]);
      const g = clampByte(data[i + 1] + current[e + 1]);
      const b = clampByte(data[i + 2] + current[e + 2]);
      const key = bucketOf(r, g, b, a);
      let c = ofDithered[key];
      if (c < 0) {
        const k = a / 255;
        c = nearest(r * k, g * k, b * k, a);
        ofDithered[key] = c;
      }
      indices[p] = c;
      const o = c * 4;
      const k = (strength * a) / 255;
      const er = (r - palette[o]) * k;
      const eg = (g - palette[o + 1]) * k;
      const eb = (b - palette[o + 2]) * k;
      if (er === 0 && eg === 0 && eb === 0) continue;
      current[e + 3] += (er * 7) / 16;
      current[e + 4] += (eg * 7) / 16;
      current[e + 5] += (eb * 7) / 16;
      next[e - 3] += (er * 3) / 16;
      next[e - 2] += (eg * 3) / 16;
      next[e - 1] += (eb * 3) / 16;
      next[e] += (er * 5) / 16;
      next[e + 1] += (eg * 5) / 16;
      next[e + 2] += (eb * 5) / 16;
      next[e + 3] += er / 16;
      next[e + 4] += eg / 16;
      next[e + 5] += eb / 16;
    }
    [current, next] = [next, current];
    [above, below] = [below, above];
  }
  return { palette, count, indices };
}

/** 相邻像素的通道差超过这个就算硬边缘，不抖动 */
const EDGE = 48;

/** 两个像素四个通道里差得最多的那个 */
function channelDiff(data: Uint8Array | Uint8ClampedArray, i: number, j: number): number {
  return Math.max(
    Math.abs(data[i] - data[j]),
    Math.abs(data[i + 1] - data[j + 1]),
    Math.abs(data[i + 2] - data[j + 2]),
    Math.abs(data[i + 3] - data[j + 3]),
  );
}

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

const CHANNEL_WEIGHT = [WR, WG, WB, WA];

/** 盒子的加权平方误差和方差最大的通道 */
function describe(
  order: number[],
  start: number,
  end: number,
  mean: Float64Array,
  weight: Float64Array,
): Box {
  let w = 0;
  const s = [0, 0, 0, 0];
  const s2 = [0, 0, 0, 0];
  for (let k = start; k < end; k++) {
    const j = order[k];
    const wj = weight[j];
    w += wj;
    for (let ch = 0; ch < 4; ch++) {
      const v = mean[j * 4 + ch];
      s[ch] += wj * v;
      s2[ch] += wj * v * v;
    }
  }
  let error = 0;
  let channel = 0;
  let widest = -1;
  for (let ch = 0; ch < 4; ch++) {
    const variance = Math.max(0, s2[ch] - (s[ch] * s[ch]) / w) * CHANNEL_WEIGHT[ch];
    error += variance;
    if (variance > widest) {
      widest = variance;
      channel = ch;
    }
  }
  // 只有一个桶的盒子切不开
  return { start, end, error: end - start > 1 ? error : 0, channel };
}

function medianCut(
  order: number[],
  mean: Float64Array,
  weight: Float64Array,
  maxBoxes: number,
): Box[] {
  const boxes: Box[] = [describe(order, 0, order.length, mean, weight)];
  while (boxes.length < maxBoxes) {
    let pick = -1;
    for (let b = 0; b < boxes.length; b++) {
      if (boxes[b].error > 0 && (pick < 0 || boxes[b].error > boxes[pick].error)) pick = b;
    }
    if (pick < 0) break;
    const box = boxes[pick];
    const ch = box.channel;
    const slice = order
      .slice(box.start, box.end)
      .sort((x, y) => mean[x * 4 + ch] - mean[y * 4 + ch]);
    for (let k = 0; k < slice.length; k++) order[box.start + k] = slice[k];
    let total = 0;
    for (const j of slice) total += weight[j];
    let acc = 0;
    let split = box.start + 1;
    for (let k = box.start; k < box.end - 1; k++) {
      acc += weight[order[k]];
      split = k + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(
      pick,
      1,
      describe(order, box.start, split, mean, weight),
      describe(order, split, box.end, mean, weight),
    );
  }
  return boxes;
}

function boxMean(order: number[], box: Box, mean: Float64Array, weight: Float64Array): number[] {
  const s = [0, 0, 0, 0];
  let w = 0;
  for (let k = box.start; k < box.end; k++) {
    const j = order[k];
    w += weight[j];
    for (let ch = 0; ch < 4; ch++) s[ch] += weight[j] * mean[j * 4 + ch];
  }
  return s.map((v) => v / w);
}

/** 在桶上做 k-means：每个桶归给最近的中心，中心换成成员的加权均值；空了的中心保留原值 */
function refine(
  order: number[],
  mean: Float64Array,
  weight: Float64Array,
  centers: number[][],
  iterations: number,
): number[][] {
  let current = centers;
  const k = current.length;
  for (let it = 0; it < iterations && k > 1; it++) {
    const s = new Float64Array(k * 4);
    const w = new Float64Array(k);
    for (const j of order) {
      const r = mean[j * 4];
      const g = mean[j * 4 + 1];
      const b = mean[j * 4 + 2];
      const a = mean[j * 4 + 3];
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < k; c++) {
        const center = current[c];
        const dr = center[0] - r;
        const dg = center[1] - g;
        const db = center[2] - b;
        const da = center[3] - a;
        const d = WR * dr * dr + WG * dg * dg + WB * db * db + WA * da * da;
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      const wj = weight[j];
      w[best] += wj;
      s[best * 4] += wj * r;
      s[best * 4 + 1] += wj * g;
      s[best * 4 + 2] += wj * b;
      s[best * 4 + 3] += wj * a;
    }
    current = current.map((center, c) =>
      w[c] > 0
        ? [s[c * 4] / w[c], s[c * 4 + 1] / w[c], s[c * 4 + 2] / w[c], s[c * 4 + 3] / w[c]]
        : center,
    );
  }
  return current;
}
