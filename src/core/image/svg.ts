import type { DrawPlan, Size } from './plan.ts';

/**
 * SVG 是矢量图，createImageBitmap 解不了（Chromium 直接报 "could not be decoded"），
 * 只能交给 <img> 画到画布上，所以这部分在主线程跑。
 * <img> 里的 SVG 不执行脚本、不加载外部资源，不会联网。
 */

/** 没写尺寸的 SVG 浏览器按 300×150 显示 */
const DEFAULT_SIZE: Size = { width: 300, height: 150 };

const UNIT_PX: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  em: 16,
  ex: 8,
};

/** "12cm" → CSS 像素；百分比和写错的值返回 null */
export function svgLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^\s*([0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)\s*([a-z]*)\s*$/i.exec(value);
  if (match === null) return null;
  const unit = UNIT_PX[match[2].toLowerCase()];
  const number = Number(match[1]) * (unit ?? NaN);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function rootAttributes(text: string): Record<string, string> {
  const tag = /<svg\b([^>]*)>/i.exec(text.replace(/<!--[\s\S]*?-->/g, ''));
  const attributes: Record<string, string> = {};
  if (tag === null) return attributes;
  for (const m of tag[1].matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attributes[m[1]] = m[3] ?? m[4] ?? '';
  }
  return attributes;
}

function viewBoxOf(value: string | undefined): Size | null {
  if (value === undefined) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2] <= 0 || parts[3] <= 0) {
    return null;
  }
  return { width: parts[2], height: parts[3] };
}

/** 固有尺寸：width/height 属性优先，缺一个按 viewBox 的比例补，都没有用 viewBox，再没有用 300×150 */
export function svgIntrinsicSize(text: string): Size {
  const attributes = rootAttributes(text);
  const width = svgLength(attributes.width);
  const height = svgLength(attributes.height);
  const box = viewBoxOf(attributes.viewBox);
  if (width !== null && height !== null) return { width, height };
  if (box !== null) {
    if (width !== null) return { width, height: (width * box.height) / box.width };
    if (height !== null) return { width: (height * box.width) / box.height, height };
    return box;
  }
  return { width: width ?? DEFAULT_SIZE.width, height: height ?? DEFAULT_SIZE.height };
}

/**
 * 按 plan 把 SVG 画到画布上。plan 的源坐标以固有尺寸为单位；
 * 先把 SVG 自身的 width/height 改成放大后的尺寸，浏览器按矢量重新排，放大也清晰。
 */
export async function renderSvg(
  file: Blob,
  plan: DrawPlan,
  intrinsic: Size,
  signal?: AbortSignal,
): Promise<OffscreenCanvas> {
  const text = await file.text();
  signal?.throwIfAborted();
  const k = plan.sw > 0 ? plan.dw / plan.sw : 1;
  const width = Math.max(1, Math.round(intrinsic.width * k));
  const height = Math.max(1, Math.round(intrinsic.height * k));
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('invalid svg');
  }
  // 没有 viewBox 时改 width/height 只会裁切不会缩放，先按原尺寸补一个
  if (!root.hasAttribute('viewBox')) {
    root.setAttribute('viewBox', `0 0 ${intrinsic.width} ${intrinsic.height}`);
  }
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }),
  );
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    signal?.throwIfAborted();
    const canvas = new OffscreenCanvas(plan.width, plan.height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(
      img,
      plan.sx * k,
      plan.sy * k,
      plan.sw * k,
      plan.sh * k,
      plan.dx,
      plan.dy,
      plan.dw,
      plan.dh,
    );
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
