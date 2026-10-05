import { isJpeg, isPng, parseJpeg } from './jpeg.ts';

/**
 * 只看文件头判断图片格式、尺寸、会不会带透明、是不是动图。
 * 不解码像素：列表里先显示格式和尺寸，动图在处理前就能提示会跳过。
 * 扩展名不可信（微信存下来的 .jpg 常常是 PNG 或 WebP），一律以文件头为准。
 */

export type SourceFormat =
  'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'avif' | 'heic' | 'tiff' | 'ico' | 'svg' | 'unknown';

export interface ImageHeader {
  readonly format: SourceFormat;
  /** 文件里存的像素尺寸（JPEG 未按 EXIF 方向转过） */
  readonly width?: number;
  readonly height?: number;
  /** 文件头声明了透明通道；是否真有透明像素要解码后才知道 */
  readonly mayHaveAlpha: boolean;
  /** 多帧 GIF、APNG、动画 WebP、AVIF 序列 */
  readonly animated: boolean;
  /** JPEG 的 EXIF 方向，1 表示不用转 */
  readonly orientation: number;
}

const UNKNOWN: ImageHeader = {
  format: 'unknown',
  mayHaveAlpha: true,
  animated: false,
  orientation: 1,
};

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

export function sniffImage(bytes: Uint8Array): ImageHeader {
  if (isJpeg(bytes)) return sniffJpeg(bytes);
  if (isPng(bytes)) return sniffPng(bytes);
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return sniffGif(bytes);
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return sniffWebp(bytes);
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) return sniffBmp(bytes);
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return sniffIsoBmff(bytes);
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a))
  ) {
    return { ...UNKNOWN, format: 'tiff' };
  }
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return { ...UNKNOWN, format: 'ico' };
  }
  if (looksLikeSvg(bytes)) return { ...UNKNOWN, format: 'svg' };
  return UNKNOWN;
}

/** EXIF 方向 5～8 要把宽高对调，得到摆正后看到的尺寸 */
export function displaySize(header: ImageHeader): { width: number; height: number } | null {
  if (header.width === undefined || header.height === undefined) return null;
  return header.orientation >= 5
    ? { width: header.height, height: header.width }
    : { width: header.width, height: header.height };
}

function sniffJpeg(bytes: Uint8Array): ImageHeader {
  const info = parseJpeg(bytes);
  return {
    format: 'jpeg',
    width: info?.width,
    height: info?.height,
    mayHaveAlpha: false,
    animated: false,
    orientation: info?.orientation ?? 1,
  };
}

/** 逐块走到 IDAT 为止：IHDR 给尺寸和颜色类型，tRNS 表示有透明色，acTL 出现在 IDAT 之前就是 APNG */
function sniffPng(bytes: Uint8Array): ImageHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width: number | undefined;
  let height: number | undefined;
  let alpha = false;
  let animated = false;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === 'IHDR' && offset + 18 <= bytes.length) {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const colorType = bytes[offset + 17];
      if (colorType === 4 || colorType === 6) alpha = true;
    } else if (type === 'tRNS') {
      alpha = true;
    } else if (type === 'acTL' && offset + 12 <= bytes.length) {
      animated = view.getUint32(offset + 8) > 1;
    } else if (type === 'IDAT' || type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  return { format: 'png', width, height, mayHaveAlpha: alpha, animated, orientation: 1 };
}

/** 跳过扩展块和图像数据，数到第二个图像描述符就算动图；图形控制扩展里的透明标志表示有透明色 */
function sniffGif(bytes: Uint8Array): ImageHeader {
  const width = bytes.length >= 10 ? bytes[6] | (bytes[7] << 8) : undefined;
  const height = bytes.length >= 10 ? bytes[8] | (bytes[9] << 8) : undefined;
  let alpha = false;
  let frames = 0;
  let offset = 13;
  if (bytes.length > 10 && bytes[10] & 0x80) offset += 3 * (1 << ((bytes[10] & 0x07) + 1));
  const skipSubBlocks = (from: number): number => {
    let p = from;
    while (p < bytes.length && bytes[p] !== 0) p += bytes[p] + 1;
    return p + 1;
  };
  while (offset < bytes.length && frames < 2) {
    const marker = bytes[offset];
    if (marker === 0x21) {
      // 0xF9 图形控制扩展：块长 4，第一个字节的最低位是透明色标志
      if (bytes[offset + 1] === 0xf9 && offset + 3 < bytes.length && bytes[offset + 3] & 0x01) {
        alpha = true;
      }
      offset = skipSubBlocks(offset + 2);
    } else if (marker === 0x2c) {
      frames++;
      const packed = bytes[offset + 9] ?? 0;
      offset += 10;
      if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));
      offset = skipSubBlocks(offset + 1);
    } else {
      break;
    }
  }
  return {
    format: 'gif',
    width,
    height,
    mayHaveAlpha: alpha,
    animated: frames > 1,
    orientation: 1,
  };
}

/** WebP 有三种头：VP8（有损，无透明）、VP8L（无损，带透明标志）、VP8X（扩展，带透明和动画标志） */
function sniffWebp(bytes: Uint8Array): ImageHeader {
  const chunk = ascii(bytes, 12, 4);
  const base = { format: 'webp' as const, orientation: 1 };
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      ...base,
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      mayHaveAlpha: false,
      animated: false,
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      ...base,
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      mayHaveAlpha: (b3 & 0x10) !== 0,
      animated: false,
    };
  }
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const flags = bytes[20];
    return {
      ...base,
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      mayHaveAlpha: (flags & 0x10) !== 0,
      animated: (flags & 0x02) !== 0,
    };
  }
  return { ...base, mayHaveAlpha: true, animated: false };
}

function sniffBmp(bytes: Uint8Array): ImageHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint32(14, true);
  // 老式 OS/2 头只有 12 字节，宽高是 16 位
  if (headerSize === 12) {
    return {
      format: 'bmp',
      width: view.getUint16(18, true),
      height: view.getUint16(20, true),
      mayHaveAlpha: false,
      animated: false,
      orientation: 1,
    };
  }
  if (bytes.length < 30) return { ...UNKNOWN, format: 'bmp' };
  return {
    format: 'bmp',
    width: Math.abs(view.getInt32(18, true)),
    // 高度为负表示自上而下存储
    height: Math.abs(view.getInt32(22, true)),
    mayHaveAlpha: view.getUint16(28, true) === 32,
    animated: false,
    orientation: 1,
  };
}

/** AVIF / HEIC 都是 ISO BMFF 容器，看 ftyp 里的品牌 */
function sniffIsoBmff(bytes: Uint8Array): ImageHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxSize = Math.min(view.getUint32(0), bytes.length);
  const brands = [ascii(bytes, 8, 4)];
  for (let p = 16; p + 4 <= boxSize; p += 4) brands.push(ascii(bytes, p, 4));
  const has = (...names: string[]): boolean => names.some((n) => brands.includes(n));
  if (has('avif', 'avis')) {
    return { ...UNKNOWN, format: 'avif', animated: brands[0] === 'avis' };
  }
  if (has('heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1')) {
    return { ...UNKNOWN, format: 'heic', animated: has('hevc', 'hevx', 'msf1') && !has('heic') };
  }
  return UNKNOWN;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 2048))
    .replace(/^﻿/, '')
    .trimStart();
  return head.startsWith('<') && /<svg[\s>]/i.test(head);
}
