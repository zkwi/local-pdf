/**
 * 主线程兜底解码：有些格式 createImageBitmap 解不了，但浏览器的 <img> 能显示
 * （比如 Safari 里的 HEIC、TIFF）。先用 <img> 画成 PNG，再交给图片 Worker 照常处理。
 * 需要 DOM，只能在主线程调用。
 */
export async function decodeWithImage(
  file: Blob,
  maxPixels: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    signal?.throwIfAborted();
    const { naturalWidth: width, naturalHeight: height } = img;
    if (!(width > 0 && height > 0)) throw new Error('image not decoded');
    // 超过像素上限的在这里就缩小，Worker 那边按普通 PNG 接着处理
    const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('canvas 2d context unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    canvas.width = 0;
    canvas.height = 0;
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
