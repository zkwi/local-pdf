import type { BBox } from '../contracts/geometry.ts';

/** 单张图裁剪后的最大像素数，超过就等比缩小，避免几十兆的 DOCX */
const MAX_IMAGE_PIXELS = 4_000_000;

export interface CroppedImage {
  readonly data: Uint8Array;
  readonly widthPt: number;
  readonly heightPt: number;
}

/**
 * 从整页渲染结果里按坐标裁剪。
 * 直接抠 PDF 里的原始图像资源经常拿不到"看到的样子"（蒙版、透明、多图拼接、裁剪路径都会丢），
 * 按页面坐标裁渲染结果反而稳定。
 */
export async function cropToPng(
  canvas: OffscreenCanvas,
  bbox: BBox,
  scale: number,
): Promise<CroppedImage | null> {
  const sx = Math.max(0, Math.floor(bbox.x * scale));
  const sy = Math.max(0, Math.floor(bbox.y * scale));
  const sw = Math.min(canvas.width - sx, Math.ceil(bbox.width * scale));
  const sh = Math.min(canvas.height - sy, Math.ceil(bbox.height * scale));
  if (sw <= 1 || sh <= 1) return null;

  const shrink = Math.min(1, Math.sqrt(MAX_IMAGE_PIXELS / (sw * sh)));
  const dw = Math.max(1, Math.round(sw * shrink));
  const dh = Math.max(1, Math.round(sh * shrink));

  const target = new OffscreenCanvas(dw, dh);
  const ctx = target.getContext('2d');
  if (ctx === null) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, dw, dh);

  const blob = await target.convertToBlob({ type: 'image/png' });
  const buffer = await blob.arrayBuffer();
  target.width = 0;
  target.height = 0;

  return {
    data: new Uint8Array(buffer),
    widthPt: bbox.width,
    heightPt: bbox.height,
  };
}
