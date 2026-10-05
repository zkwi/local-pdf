/** 像素层面的两个判断：有没有透明、像不像照片 */

/** 只要有一个像素不是完全不透明就算有透明；找到就停 */
export function hasTransparency(data: Uint8Array | Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

/**
 * 抽样判断是不是照片：颜色种类多的是照片，JPEG 划算；截图、图表颜色少，无损反而更小也更清楚。
 */
export function looksPhotographic(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  const total = width * height;
  const samples = Math.min(4096, total);
  const step = Math.max(1, Math.floor(total / samples));
  const colors = new Set<number>();
  let count = 0;
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    // 低两位抹掉，抗噪
    colors.add(((pixels[i] >> 2) << 12) | ((pixels[i + 1] >> 2) << 6) | (pixels[i + 2] >> 2));
    count++;
  }
  return colors.size > count * 0.35;
}
