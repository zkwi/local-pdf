import { zlibSync } from 'fflate';
import { crc32 } from '../util/crc32.ts';
import { quantize } from './quantize.ts';

/**
 * 自己写 PNG，而不是用画布的 convertToBlob：浏览器追求编码速度，压得很松，
 * 实测把一张优化过的截图重存一遍会大 80% 以上。这里按内容挑最省的颜色类型
 * （灰度 / 调色板 / RGB / RGBA，调色板按颜色数用 1～8 位），逐行选滤波器，再用 fflate 最高级别压缩。
 * colors > 0 时先减色（有损），颜色本来就不超过 256 种时无论哪档都是无损的调色板。
 */

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** 未预乘的 RGBA，getImageData 的结果 */
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface PngEncodeOptions {
  /** 最多颜色数，0 表示无损 */
  readonly colors: number;
  /** 写 pHYs，0 表示不写 */
  readonly dpi: number;
  /** deflate 级别，默认 9 */
  readonly level?: 6 | 7 | 8 | 9;
}

export interface PngEncodeResult {
  readonly bytes: Uint8Array;
  /** 调色板颜色数；真彩色为 0 */
  readonly paletteSize: number;
  /** 减过色（有损） */
  readonly lossy: boolean;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 一个 PNG 块：长度 + 类型 + 数据 + CRC（覆盖类型和数据） */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 0, 4, 8 + data.length));
  return out;
}

/** pHYs：每米多少像素，单位 1 = 米 */
export function physChunk(dpi: number): Uint8Array {
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  const ppm = Math.round(dpi / 0.0254);
  view.setUint32(0, ppm);
  view.setUint32(4, ppm);
  data[8] = 1;
  return pngChunk('pHYs', data);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

interface Analysis {
  readonly alpha: boolean;
  readonly gray: boolean;
  /** 不同颜色（RGBA）不超过 256 种时的颜色表，超过为 null */
  readonly colors: Map<number, number> | null;
}

/** 完全透明的像素颜色看不见，统一成 0 让压缩更省（返回的是副本） */
function normalized(data: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
    }
  }
  return out;
}

function analyze(data: Uint8Array): Analysis {
  let alpha = false;
  let gray = true;
  let colors: Map<number, number> | null = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a !== 255) alpha = true;
    if (r !== g || g !== b) gray = false;
    if (colors !== null) {
      const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
      if (!colors.has(key)) {
        if (colors.size >= 256) colors = null;
        else colors.set(key, colors.size);
      }
    }
  }
  return { alpha, gray, colors };
}

function bitDepthFor(count: number): 1 | 2 | 4 | 8 {
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 16) return 4;
  return 8;
}

/** 调色板图：下标按位深打包，每行前面是滤波类型 0（调色板图用滤波器反而更大） */
function packIndexed(
  indices: Uint8Array,
  width: number,
  height: number,
  depth: number,
): Uint8Array {
  const rowBytes = Math.ceil((width * depth) / 8);
  const raw = new Uint8Array((rowBytes + 1) * height);
  const perByte = 8 / depth;
  for (let y = 0; y < height; y++) {
    const row = y * (rowBytes + 1) + 1;
    if (depth === 8) {
      raw.set(indices.subarray(y * width, y * width + width), row);
      continue;
    }
    for (let x = 0; x < width; x++) {
      const shift = 8 - depth * ((x % perByte) + 1);
      raw[row + Math.floor(x / perByte)] |= indices[y * width + x] << shift;
    }
  }
  return raw;
}

/** 8 位多通道图：每行试五种滤波器，取差值绝对值之和最小的（libpng 的经典启发式） */
function filterRows(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  const zero = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const line = pixels.subarray(y * stride, y * stride + stride);
    const prev = y === 0 ? zero : pixels.subarray((y - 1) * stride, y * stride);
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = candidates[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels] : 0;
        const b = prev[i];
        const c = i >= channels ? prev[i - channels] : 0;
        let predicted = 0;
        if (f === 1) predicted = a;
        else if (f === 2) predicted = b;
        else if (f === 3) predicted = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (line[i] - predicted) & 0xff;
        out[i] = v;
        score += v < 128 ? v : 256 - v;
        if (score >= bestScore) break;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    // 提前跳出的只会是落选的滤波器，选中的那个一定算完整了
    const row = y * (stride + 1);
    raw[row] = best;
    raw.set(candidates[best], row + 1);
  }
  return raw;
}

function ihdr(width: number, height: number, depth: number, colorType: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = depth;
  data[9] = colorType;
  return pngChunk('IHDR', data);
}

function assemble(
  header: Uint8Array,
  extra: readonly Uint8Array[],
  raw: Uint8Array,
  options: PngEncodeOptions,
): Uint8Array {
  const parts = [SIGNATURE, header];
  if (options.dpi > 0) parts.push(physChunk(options.dpi));
  parts.push(...extra);
  parts.push(pngChunk('IDAT', zlibSync(raw, { level: options.level ?? 9 })));
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  return concat(parts);
}

/** 调色板 + 透明表；透明的颜色排在前面，tRNS 只需要写到最后一个不完全不透明的颜色 */
function encodeIndexed(
  width: number,
  height: number,
  palette: Uint8Array,
  count: number,
  indices: Uint8Array,
  options: PngEncodeOptions,
): Uint8Array {
  const order = Array.from({ length: count }, (_, i) => i).sort(
    (x, y) => (palette[x * 4 + 3] === 255 ? 1 : 0) - (palette[y * 4 + 3] === 255 ? 1 : 0),
  );
  const remap = new Uint8Array(count);
  order.forEach((from, to) => (remap[from] = to));
  const plte = new Uint8Array(count * 3);
  let lastTransparent = -1;
  const trns = new Uint8Array(count);
  order.forEach((from, to) => {
    plte[to * 3] = palette[from * 4];
    plte[to * 3 + 1] = palette[from * 4 + 1];
    plte[to * 3 + 2] = palette[from * 4 + 2];
    trns[to] = palette[from * 4 + 3];
    if (trns[to] !== 255) lastTransparent = to;
  });
  const mapped = new Uint8Array(indices.length);
  for (let i = 0; i < indices.length; i++) mapped[i] = remap[indices[i]];
  const depth = bitDepthFor(count);
  const extra = [pngChunk('PLTE', plte)];
  if (lastTransparent >= 0) extra.push(pngChunk('tRNS', trns.subarray(0, lastTransparent + 1)));
  return assemble(
    ihdr(width, height, depth, 3),
    extra,
    packIndexed(mapped, width, height, depth),
    options,
  );
}

export function encodePng(image: RgbaImage, options: PngEncodeOptions): PngEncodeResult {
  const { width, height } = image;
  const data = normalized(image.data);
  const info = analyze(data);

  // 颜色本来就少：调色板是无损的，通常也最小；17 级以上的纯灰度图直接存灰度，省掉调色板
  const grayLossless = info.gray && !info.alpha && (info.colors === null || info.colors.size > 16);
  if (info.colors !== null && !grayLossless) {
    const count = info.colors.size;
    const palette = new Uint8Array(count * 4);
    for (const [key, index] of info.colors) {
      palette[index * 4] = key >>> 24;
      palette[index * 4 + 1] = (key >>> 16) & 0xff;
      palette[index * 4 + 2] = (key >>> 8) & 0xff;
      palette[index * 4 + 3] = key & 0xff;
    }
    const indices = new Uint8Array(width * height);
    for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
      const key = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
      indices[p] = info.colors.get(key) ?? 0;
    }
    return {
      bytes: encodeIndexed(width, height, palette, count, indices, options),
      paletteSize: count,
      lossy: false,
    };
  }

  if (options.colors > 0 && !grayLossless) {
    // 颜色越少抖得越重，免得渐变出色带；平整色块和边缘不抖，由 quantize 按内容判断
    const q = quantize(data, width, height, Math.min(256, options.colors), {
      dither: options.colors >= 128 ? 0.75 : 0.85,
    });
    return {
      bytes: encodeIndexed(width, height, q.palette, q.count, q.indices, options),
      paletteSize: q.count,
      lossy: true,
    };
  }

  // 无损真彩色：按需要的通道数打包
  const channels = info.gray ? (info.alpha ? 2 : 1) : info.alpha ? 4 : 3;
  const colorType = info.gray ? (info.alpha ? 4 : 0) : info.alpha ? 6 : 2;
  const pixels = width * height;
  let packed: Uint8Array;
  if (channels === 4) packed = data;
  else {
    packed = new Uint8Array(pixels * channels);
    for (let p = 0, i = 0, o = 0; p < pixels; p++, i += 4, o += channels) {
      if (channels === 1) packed[o] = data[i];
      else if (channels === 2) {
        packed[o] = data[i];
        packed[o + 1] = data[i + 3];
      } else {
        packed[o] = data[i];
        packed[o + 1] = data[i + 1];
        packed[o + 2] = data[i + 2];
      }
    }
  }
  return {
    bytes: assemble(
      ihdr(width, height, 8, colorType),
      [],
      filterRows(packed, width, height, channels),
      options,
    ),
    paletteSize: 0,
    lossy: false,
  };
}

/**
 * 给现有 PNG 补上（或换掉）pHYs：保留原图时也能写 DPI，不用重新编码。
 * 不是合法 PNG 时原样返回。
 */
export function setPngDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (bytes.length < 33 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let inserted = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return bytes;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
    // pHYs 必须在第一个 IDAT 之前，紧跟 IHDR 最稳
    if (type === 'IHDR' && !inserted) {
      parts.push(physChunk(dpi));
      inserted = true;
    }
    offset = end;
    if (type === 'IEND') break;
  }
  return inserted ? concat(parts) : bytes;
}
