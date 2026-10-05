import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { encodePng, setPngDpi } from '../src/core/image/png.ts';
import { quantize } from '../src/core/image/quantize.ts';
import { crc32 } from '../src/core/util/crc32.ts';

interface Decoded {
  width: number;
  height: number;
  colorType: number;
  depth: number;
  rgba: Uint8Array;
  chunks: string[];
  dpi: number | null;
  paletteSize: number;
}

/** 测试用的最小 PNG 解码器：校验每个块的 CRC，解压、反滤波，展开成 RGBA */
function decodePng(bytes: Uint8Array): Decoded {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let palette = new Uint8Array(0);
  let trns = new Uint8Array(0);
  let dpi: number | null = null;
  const idat: Uint8Array[] = [];
  const chunks: string[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    expect(view.getUint32(offset + 8 + length), `${type} CRC`).toBe(
      crc32(bytes, 0, offset + 4, offset + 8 + length),
    );
    chunks.push(type);
    const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === 'IHDR') {
      width = d.getUint32(0);
      height = d.getUint32(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === 'PLTE') palette = data.slice();
    else if (type === 'tRNS') trns = data.slice();
    else if (type === 'IDAT') idat.push(data.slice());
    else if (type === 'pHYs') dpi = Math.round(d.getUint32(0) * 0.0254);
    offset += 12 + length;
  }
  const joined = new Uint8Array(idat.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const part of idat) {
    joined.set(part, o);
    o += part.length;
  }
  const raw = unzlibSync(joined);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType] ?? 0;
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? lines[y * stride + i - bpp] : 0;
      const b = y > 0 ? lines[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? lines[(y - 1) * stride + i - bpp] : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      lines[y * stride + i] = (x + p) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      const row = y * stride;
      if (colorType === 3) {
        const perByte = 8 / depth;
        const byte = lines[row + Math.floor(x / perByte)];
        const shift = 8 - depth * ((x % perByte) + 1);
        const index = (byte >> shift) & ((1 << depth) - 1);
        rgba.set(palette.subarray(index * 3, index * 3 + 3), out);
        rgba[out + 3] = index < trns.length ? trns[index] : 255;
      } else {
        const px = lines.subarray(row + x * channels, row + x * channels + channels);
        if (colorType === 0) rgba.set([px[0], px[0], px[0], 255], out);
        else if (colorType === 4) rgba.set([px[0], px[0], px[0], px[1]], out);
        else if (colorType === 2) rgba.set([px[0], px[1], px[2], 255], out);
        else rgba.set(px, out);
      }
    }
  }
  return { width, height, colorType, depth, rgba, chunks, dpi, paletteSize: palette.length / 3 };
}

function image(width: number, height: number, pixel: (x: number, y: number) => number[]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

/** 渐变 + 噪点：颜色远超 256 种 */
const photo = image(64, 48, (x, y) => [
  (x * 4 + ((x * y) % 7)) & 255,
  (y * 5 + ((x + y) % 5)) & 255,
  (x * y) & 255,
  255,
]);

describe('PNG 编码', () => {
  it('真彩色无损：解码回来逐像素一致，选 RGB 不带透明通道', () => {
    const out = encodePng(photo, { colors: 0, dpi: 0 });
    const decoded = decodePng(out.bytes);
    expect(decoded.colorType).toBe(2);
    expect(decoded.rgba).toEqual(photo.data);
    expect(out.lossy).toBe(false);
  });

  it('带半透明的真彩色存 RGBA，完全透明像素的颜色清零', () => {
    const src = image(40, 30, (x, y) => [x * 6, y * 8, (x + y) * 3, x < 5 ? 0 : 128 + y]);
    const decoded = decodePng(encodePng(src, { colors: 0, dpi: 0 }).bytes);
    expect(decoded.colorType).toBe(6);
    for (let i = 0; i < src.data.length; i += 4) {
      if (src.data[i + 3] === 0) expect([...decoded.rgba.subarray(i, i + 4)]).toEqual([0, 0, 0, 0]);
      else expect([...decoded.rgba.subarray(i, i + 4)]).toEqual([...src.data.subarray(i, i + 4)]);
    }
  });

  it('灰度图存成单通道灰度', () => {
    const src = image(50, 20, (x) => [x * 5, x * 5, x * 5, 255]);
    const decoded = decodePng(encodePng(src, { colors: 256, dpi: 0 }).bytes);
    expect(decoded.colorType).toBe(0);
    expect(decoded.rgba).toEqual(src.data);
  });

  it('颜色不超过 256 种时用调色板，按颜色数选位深，仍然无损', () => {
    const two = image(33, 9, (x, y) => ((x + y) % 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const twoDecoded = decodePng(encodePng(two, { colors: 0, dpi: 0 }).bytes);
    expect([twoDecoded.colorType, twoDecoded.depth]).toEqual([3, 1]);
    expect(twoDecoded.rgba).toEqual(two.data);

    const sixteen = image(17, 17, (x, y) => [(x % 4) * 60, (y % 4) * 60, 30, 255]);
    const sixteenDecoded = decodePng(encodePng(sixteen, { colors: 0, dpi: 0 }).bytes);
    expect([sixteenDecoded.colorType, sixteenDecoded.depth]).toEqual([3, 4]);
    expect(sixteenDecoded.rgba).toEqual(sixteen.data);
  });

  it('调色板带透明：tRNS 只写到最后一个不完全不透明的颜色', () => {
    const src = image(10, 10, (x) =>
      x < 3 ? [0, 0, 0, 0] : x < 6 ? [10, 200, 30, 120] : [250, 250, 250, 255],
    );
    const out = encodePng(src, { colors: 0, dpi: 0 });
    const decoded = decodePng(out.bytes);
    expect(decoded.chunks).toContain('tRNS');
    expect(decoded.rgba).toEqual(src.data);
    expect(out.lossy).toBe(false);
  });

  it('减色：颜色数不超过上限，误差有限，有损标记打上', () => {
    const out = encodePng(photo, { colors: 64, dpi: 0 });
    const decoded = decodePng(out.bytes);
    expect(decoded.colorType).toBe(3);
    expect(decoded.paletteSize).toBeLessThanOrEqual(64);
    expect(out.lossy).toBe(true);
    let error = 0;
    for (let i = 0; i < photo.data.length; i++) error += Math.abs(photo.data[i] - decoded.rgba[i]);
    // 随机分布的颜色压到 64 色，每通道平均误差约为格子边长的四分之一
    expect(error / photo.data.length).toBeLessThan(16);
  });

  it('写入 pHYs，DPI 能读回来；给现有 PNG 补 DPI 不动像素', () => {
    const out = encodePng(photo, { colors: 0, dpi: 300 });
    expect(decodePng(out.bytes).dpi).toBe(300);
    const plain = encodePng(photo, { colors: 0, dpi: 0 }).bytes;
    const patched = setPngDpi(plain, 72);
    const decoded = decodePng(patched);
    expect(decoded.dpi).toBe(72);
    expect(decoded.chunks.indexOf('pHYs')).toBe(1);
    expect(decoded.rgba).toEqual(photo.data);
    // 已有 pHYs 的换掉，不重复
    expect(decodePng(setPngDpi(patched, 150)).chunks.filter((c) => c === 'pHYs')).toHaveLength(1);
  });
});

describe('减色', () => {
  it('完全透明的像素单独占一个颜色，映射回去仍然完全透明', () => {
    const src = image(30, 30, (x, y) => (x < 10 ? [9, 9, 9, 0] : [x * 8, y * 8, 100, 255]));
    const q = quantize(src.data, 30, 30, 16, { dither: 0 });
    expect(q.count).toBeLessThanOrEqual(16);
    for (let p = 0; p < 900; p++) {
      if (src.data[p * 4 + 3] === 0) expect(q.palette[q.indices[p] * 4 + 3]).toBe(0);
      else expect(q.palette[q.indices[p] * 4 + 3]).toBe(255);
    }
  });

  it('抖动版本的下标都落在调色板里', () => {
    const q = quantize(photo.data, photo.width, photo.height, 32, { dither: 0.8 });
    expect(Math.max(...q.indices)).toBeLessThan(q.count);
  });

  it('只在细腻过渡处抖动：纯色块整块一个颜色，渐变照样抖', () => {
    // 左边：蓝底上的几个纯色方块（界面、图表）；右边：一段平滑渐变（照片、阴影）
    const blocks = [
      [230, 60, 60],
      [60, 200, 80],
      [240, 200, 40],
      [200, 60, 200],
      [30, 30, 30],
      [240, 240, 240],
    ];
    const src = image(96, 32, (x, y) => {
      if (x >= 48) {
        const v = (x - 48) * 5;
        return [v, 60 + (v >> 1), 255 - v, 255];
      }
      const block = x >= 4 && x < 40 && y >= 4 && y < 28 && (x - 4) % 12 < 8 && (y - 4) % 12 < 8;
      return block
        ? [...blocks[Math.floor((x - 4) / 12) + 3 * Math.floor((y - 4) / 12)], 255]
        : [40, 90, 160, 255];
    });
    const dithered = quantize(src.data, 96, 32, 8, { dither: 0.85 });
    // 平整处同一种颜色只映射到一个调色板颜色，不撒噪点
    const seen = new Map<string, number>();
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 42; x++) {
        const p = y * 96 + x;
        const key = src.data.subarray(p * 4, p * 4 + 4).join();
        expect(seen.get(key) ?? dithered.indices[p], key).toBe(dithered.indices[p]);
        seen.set(key, dithered.indices[p]);
      }
    }
    // 渐变处还在抖：按列平均的颜色比不抖时更贴近原图，没有色带
    const columnError = (q: ReturnType<typeof quantize>): number => {
      let total = 0;
      for (let x = 50; x < 96; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let y = 0; y < 32; y++) sum += q.palette[q.indices[y * 96 + x] * 4 + c];
          total += Math.abs(sum / 32 - src.data[x * 4 + c]);
        }
      }
      return total / (46 * 3);
    };
    const flat = quantize(src.data, 96, 32, 8, { dither: 0 });
    expect(columnError(dithered)).toBeLessThan(columnError(flat) / 2);
  });
});
