/**
 * 只读 JPEG 头：尺寸、分量数、EXIF 方向。
 * 有了这些就能把原始 JPEG 字节直接塞进 PDF（DCTDecode），不用解码再压一遍。
 */
export interface JpegInfo {
  readonly width: number;
  readonly height: number;
  /** 1 灰度、3 YCbCr/RGB、4 CMYK（Adobe） */
  readonly components: number;
  /** EXIF Orientation，1 或缺省表示不用旋转 */
  readonly orientation: number;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
}

export function parseJpeg(bytes: Uint8Array): JpegInfo | null {
  if (!isJpeg(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let orientation = 1;
  let size: { width: number; height: number; components: number } | null = null;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // 填充字节和无长度的独立标记
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && size === null && offset + 9 < bytes.length) {
      size = {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
        components: bytes[offset + 9],
      };
    } else if (marker === 0xe1) {
      orientation = readExifOrientation(bytes, offset + 4, offset + 2 + length) ?? orientation;
    }
    offset += 2 + length;
  }
  return size === null ? null : { ...size, orientation };
}

/** APP1 段里的 TIFF 结构：只找 IFD0 的 0x0112 */
function readExifOrientation(bytes: Uint8Array, start: number, end: number): number | null {
  if (end > bytes.length || end - start < 14) return null;
  if (
    bytes[start] !== 0x45 ||
    bytes[start + 1] !== 0x78 ||
    bytes[start + 2] !== 0x69 ||
    bytes[start + 3] !== 0x66
  ) {
    return null;
  }
  const tiff = start + 6;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return null;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}
