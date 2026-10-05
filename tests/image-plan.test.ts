import { describe, expect, it } from 'vitest';
import { setJpegDpi } from '../src/core/image/jpeg.ts';
import {
  chooseFormat,
  directoryOf,
  firstFit,
  keepOriginal,
  limitPlan,
  outputName,
  planResize,
  searchQuality,
  shrinkFactor,
} from '../src/core/image/plan.ts';
import type { ImageJobOptions } from '../src/core/image/plan.ts';
import { displaySize, sniffImage } from '../src/core/image/sniff.ts';
import { svgIntrinsicSize, svgLength } from '../src/core/image/svg.ts';

const base: ImageJobOptions = {
  output: 'keep',
  quality: 'standard',
  targetBytes: 0,
  resize: 'none',
  size: 1920,
  percent: 50,
  exactWidth: 800,
  exactHeight: 800,
  fit: 'cover',
  background: 'keep',
  color: '#ffffff',
  dpi: 0,
  keepUnchanged: false,
};
const photo = { width: 4000, height: 3000 };
const portrait = { width: 3000, height: 4000 };

describe('目标尺寸', () => {
  it('原尺寸不变', () => {
    const plan = planResize(photo, base);
    expect([plan.width, plan.height, plan.changed]).toEqual([4000, 3000, false]);
  });

  it('限制长边：横图竖图都按长边等比缩，比目标小的不放大', () => {
    const o = { ...base, resize: 'long' as const, size: 2000 };
    expect([planResize(photo, o).width, planResize(photo, o).height]).toEqual([2000, 1500]);
    expect([planResize(portrait, o).width, planResize(portrait, o).height]).toEqual([1500, 2000]);
    const small = planResize({ width: 800, height: 600 }, o);
    expect([small.width, small.height, small.changed]).toEqual([800, 600, false]);
  });

  it('指定宽度 / 高度 / 百分比', () => {
    const w = planResize(photo, { ...base, resize: 'width', size: 1000 });
    expect([w.width, w.height]).toEqual([1000, 750]);
    const h = planResize(photo, { ...base, resize: 'height', size: 600 });
    expect([h.width, h.height]).toEqual([800, 600]);
    const p = planResize(photo, { ...base, resize: 'percent', percent: 25 });
    expect([p.width, p.height]).toEqual([1000, 750]);
    // 百分比不超过 100
    const big = planResize(photo, { ...base, resize: 'percent', percent: 300 });
    expect([big.width, big.height, big.changed]).toEqual([4000, 3000, false]);
  });

  it('精确尺寸·裁切填满：居中裁掉多余部分', () => {
    const plan = planResize(photo, { ...base, resize: 'exact', exactWidth: 800, exactHeight: 800 });
    expect([plan.width, plan.height]).toEqual([800, 800]);
    expect([plan.sx, plan.sy, plan.sw, plan.sh]).toEqual([500, 0, 3000, 3000]);
    expect([plan.dx, plan.dy, plan.dw, plan.dh]).toEqual([0, 0, 800, 800]);
  });

  it('精确尺寸·完整放入：等比放进去，上下留边', () => {
    const plan = planResize(photo, {
      ...base,
      resize: 'exact',
      exactWidth: 800,
      exactHeight: 800,
      fit: 'contain',
    });
    expect([plan.width, plan.height, plan.dw, plan.dh, plan.dx, plan.dy]).toEqual([
      800, 800, 800, 600, 0, 100,
    ]);
  });

  it('矢量图可以放大，位图不行', () => {
    const icon = { width: 24, height: 24 };
    const o = { ...base, resize: 'long' as const, size: 512 };
    expect(planResize(icon, o).width).toBe(24);
    expect(planResize(icon, o, true).width).toBe(512);
  });

  it('超过像素上限整体缩小，取景不变', () => {
    const plan = limitPlan(planResize({ width: 10000, height: 8000 }, base), 16_000_000);
    expect(plan.width * plan.height).toBeLessThanOrEqual(16_000_000);
    expect(plan.width / plan.height).toBeCloseTo(1.25, 2);
    expect(plan.changed).toBe(true);
  });
});

describe('输出格式', () => {
  const opaque = { hasAlpha: false, photographic: true, webp: true };
  it('保持原格式：JPEG、PNG、WebP 原样；写不出来的按内容挑', () => {
    expect(chooseFormat('jpeg', 'keep', opaque)).toEqual({ format: 'jpeg', changed: false });
    expect(chooseFormat('png', 'keep', opaque)).toEqual({ format: 'png', changed: false });
    expect(chooseFormat('webp', 'keep', opaque)).toEqual({ format: 'webp', changed: false });
    expect(chooseFormat('avif', 'keep', opaque)).toEqual({ format: 'jpeg', changed: true });
    expect(chooseFormat('bmp', 'keep', { ...opaque, photographic: false })).toEqual({
      format: 'png',
      changed: true,
    });
    // 透明的图永远不会被自动改成 JPEG
    expect(chooseFormat('gif', 'keep', { ...opaque, hasAlpha: true })).toEqual({
      format: 'png',
      changed: true,
    });
  });

  it('浏览器写不了 WebP 时退回 PNG / JPEG', () => {
    const noWebp = { ...opaque, webp: false };
    expect(chooseFormat('webp', 'keep', noWebp)).toEqual({ format: 'jpeg', changed: true });
    expect(chooseFormat('png', 'webp', { ...noWebp, hasAlpha: true })).toEqual({
      format: 'png',
      changed: true,
    });
  });

  it('明确选了格式就照做', () => {
    expect(chooseFormat('png', 'jpeg', { ...opaque, hasAlpha: true }).format).toBe('jpeg');
    expect(chooseFormat('jpeg', 'png', opaque).format).toBe('png');
  });
});

describe('文件名', () => {
  it('换扩展名，去掉非法字符', () => {
    expect(outputName('IMG_0001.HEIC', 'jpeg')).toBe('IMG_0001.jpg');
    expect(outputName('a.b.png', 'webp')).toBe('a.b.webp');
    expect(outputName('无扩展名', 'png')).toBe('无扩展名.png');
    expect(outputName('x:y?.png', 'png')).toBe('x_y_.png');
    expect(outputName('.png', 'png')).toBe('image.png');
  });

  it('相对路径取目录', () => {
    expect(directoryOf('photos/2024/a.jpg')).toBe('photos/2024/');
    expect(directoryOf('a.jpg')).toBe('');
  });
});

describe('按目标大小找画质', () => {
  /** 体积随质量线性增长的假编码器 */
  const fake = (k: number) => async (q: number) => ({ size: Math.round(q * k), q });

  it('最高质量就够小，直接用', async () => {
    const r = await searchQuality(fake(1000), 2000);
    expect(r.fits).toBe(true);
    expect(r.quality).toBe(0.92);
  });

  it('二分找到满足上限的最高质量', async () => {
    const r = await searchQuality(fake(1000), 600);
    expect(r.fits).toBe(true);
    expect(r.result.size).toBeLessThanOrEqual(600);
    expect(r.quality).toBeGreaterThan(0.55);
  });

  it('最低质量还超，标记压不到', async () => {
    const r = await searchQuality(fake(1000), 100);
    expect(r.fits).toBe(false);
    expect(r.quality).toBe(0.3);
  });

  it('PNG 依次试颜色数；都不够小时返回最小的', async () => {
    const sizes: Record<number, number> = { 0: 900, 256: 500, 128: 300, 64: 200 };
    const encode = async (c: number) => ({ size: sizes[c] ?? 150 });
    expect((await firstFit([0, 256, 128, 64], encode, 350)).candidate).toBe(128);
    const miss = await firstFit([0, 256, 128, 64], encode, 50);
    expect([miss.candidate, miss.fits]).toEqual([64, false]);
  });

  it('缩小倍数在 0.5～0.9 之间', () => {
    expect(shrinkFactor(4_000_000, 100_000)).toBe(0.5);
    expect(shrinkFactor(110_000, 100_000)).toBeCloseTo(0.877, 2);
    expect(shrinkFactor(101_000, 100_000)).toBe(0.9);
    expect(shrinkFactor(200_000, 100_000)).toBeCloseTo(0.65, 2);
  });
});

describe('不变大保护', () => {
  const same = {
    sourceFormat: 'png' as const,
    format: 'png' as const,
    planChanged: false,
    backgroundChanged: false,
    originalSize: 100,
  };
  it('格式尺寸都没变、结果不更小时给原图', () => {
    expect(keepOriginal({ ...same, outputSize: 120 })).toBe(true);
    expect(keepOriginal({ ...same, outputSize: 80 })).toBe(false);
  });
  it('要求了改动就照做，哪怕变大', () => {
    expect(keepOriginal({ ...same, outputSize: 120, planChanged: true })).toBe(false);
    expect(keepOriginal({ ...same, outputSize: 120, format: 'jpeg' })).toBe(false);
    expect(keepOriginal({ ...same, outputSize: 120, backgroundChanged: true })).toBe(false);
  });
});

/** 拼一个最小的文件头 */
const bytes = (...parts: (readonly number[] | string)[]): Uint8Array =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const u32 = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pngChunk = (type: string, data: number[]): (readonly number[] | string)[] => [
  u32(data.length),
  type,
  data,
  [0, 0, 0, 0],
];

describe('文件头识别', () => {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = (colorType: number) =>
    pngChunk('IHDR', [...u32(640), ...u32(480), 8, colorType, 0, 0, 0]);

  it('PNG：尺寸、透明通道、tRNS、APNG', () => {
    expect(sniffImage(bytes(sig, ...ihdr(2), ...pngChunk('IDAT', [])))).toMatchObject({
      format: 'png',
      width: 640,
      height: 480,
      mayHaveAlpha: false,
      animated: false,
    });
    expect(sniffImage(bytes(sig, ...ihdr(6), ...pngChunk('IDAT', []))).mayHaveAlpha).toBe(true);
    expect(
      sniffImage(bytes(sig, ...ihdr(2), ...pngChunk('tRNS', [0, 0]), ...pngChunk('IDAT', [])))
        .mayHaveAlpha,
    ).toBe(true);
    const apng = bytes(sig, ...ihdr(6), ...pngChunk('acTL', [...u32(3), ...u32(0)]));
    expect(sniffImage(apng).animated).toBe(true);
    const single = bytes(sig, ...ihdr(6), ...pngChunk('acTL', [...u32(1), ...u32(0)]));
    expect(sniffImage(single).animated).toBe(false);
  });

  it('GIF：一帧是静图，两帧是动图，透明色标志', () => {
    const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 0, 0];
    const gce = [0x21, 0xf9, 4, 1, 0, 0, 0, 0];
    const head = ['GIF89a', [10, 0, 20, 0, 0, 0, 0]] as const;
    const one = sniffImage(bytes(...head, gce, frame, [0x3b]));
    expect(one).toMatchObject({ format: 'gif', width: 10, height: 20, animated: false });
    expect(one.mayHaveAlpha).toBe(true);
    expect(sniffImage(bytes(...head, frame, frame, [0x3b])).animated).toBe(true);
  });

  it('WebP：VP8、VP8L、VP8X 三种头', () => {
    const riff = (chunk: string, data: number[]) =>
      bytes('RIFF', [0, 0, 0, 0], 'WEBP', chunk, [0, 0, 0, 0], data);
    const vp8 = sniffImage(riff('VP8 ', [0, 0, 0, 0x9d, 1, 0x2a, 0x20, 0x03, 0x58, 0x02]));
    expect(vp8).toMatchObject({ width: 800, height: 600, mayHaveAlpha: false });
    // VP8L：宽 100、高 50、带透明
    const w = 99;
    const h = 49;
    const bits = w | (h << 14) | (1 << 28);
    const vp8l = sniffImage(
      riff('VP8L', [
        0x2f,
        bits & 255,
        (bits >>> 8) & 255,
        (bits >>> 16) & 255,
        (bits >>> 24) & 255,
      ]),
    );
    expect(vp8l).toMatchObject({ width: 100, height: 50, mayHaveAlpha: true });
    const vp8x = sniffImage(riff('VP8X', [0x12, 0, 0, 0, 0x1f, 0x03, 0, 0xdf, 0x01, 0]));
    expect(vp8x).toMatchObject({ width: 800, height: 480, mayHaveAlpha: true, animated: true });
  });

  it('BMP、AVIF、HEIC、TIFF、SVG、不认识的', () => {
    const bmpHeader = [0x42, 0x4d, ...new Array(12).fill(0), 40, 0, 0, 0, 100, 0, 0, 0];
    const bmp = sniffImage(bytes(bmpHeader, [0x38, 0xff, 0xff, 0xff, 1, 0, 32, 0]));
    expect(bmp).toMatchObject({ format: 'bmp', width: 100, height: 200, mayHaveAlpha: true });
    expect(sniffImage(bytes(u32(20), 'ftypavif', u32(0), 'mif1')).format).toBe('avif');
    expect(sniffImage(bytes(u32(20), 'ftypavis', u32(0), 'avif')).animated).toBe(true);
    expect(sniffImage(bytes(u32(24), 'ftypheic', u32(0), 'mif1heic')).format).toBe('heic');
    expect(sniffImage(bytes([0x49, 0x49, 0x2a, 0])).format).toBe('tiff');
    const svg = bytes([0xef, 0xbb, 0xbf], '<?xml version="1.0"?>\n<svg xmlns="x">');
    expect(sniffImage(svg).format).toBe('svg');
    expect(sniffImage(bytes('hello world')).format).toBe('unknown');
  });

  it('JPEG 的 EXIF 方向 5～8 宽高对调', () => {
    expect(
      displaySize({
        format: 'jpeg',
        width: 4000,
        height: 3000,
        mayHaveAlpha: false,
        animated: false,
        orientation: 6,
      }),
    ).toEqual({ width: 3000, height: 4000 });
  });
});

describe('JPEG DPI', () => {
  const jfif = bytes(
    [0xff, 0xd8, 0xff, 0xe0, 0, 16],
    'JFIF',
    [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xff, 0xd9],
  );
  it('改 JFIF 里的密度', () => {
    const out = setJpegDpi(jfif, 300);
    expect([out[13], (out[14] << 8) | out[15], (out[16] << 8) | out[17]]).toEqual([1, 300, 300]);
    expect(out.length).toBe(jfif.length);
  });
  it('没有 JFIF 段时在 SOI 后插一个', () => {
    const exif = bytes([0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xd9]);
    const out = setJpegDpi(exif, 96);
    expect([out[2], out[3], out[13], (out[14] << 8) | out[15]]).toEqual([0xff, 0xe0, 1, 96]);
    expect([...out.subarray(20, 22)]).toEqual([0xff, 0xe1]);
  });
});

describe('SVG 尺寸', () => {
  it('单位换算', () => {
    expect(svgLength('96')).toBe(96);
    expect(svgLength('1in')).toBe(96);
    expect(svgLength('72pt')).toBe(96);
    expect(svgLength('50%')).toBeNull();
    expect(svgLength('auto')).toBeNull();
  });
  it('width/height 优先，缺了按 viewBox 补，都没有按 300×150', () => {
    expect(svgIntrinsicSize('<svg width="200" height="100">')).toEqual({ width: 200, height: 100 });
    expect(svgIntrinsicSize('<svg viewBox="0 0 40 20">')).toEqual({ width: 40, height: 20 });
    expect(svgIntrinsicSize('<svg width="80" viewBox="0 0 40 20">')).toEqual({
      width: 80,
      height: 40,
    });
    expect(
      svgIntrinsicSize('<!-- <svg width="1"> --><svg height="10" viewBox="0,0,40,20">'),
    ).toEqual({ width: 20, height: 10 });
    expect(svgIntrinsicSize('<svg>')).toEqual({ width: 300, height: 150 });
  });
});
