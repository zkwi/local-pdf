import type { BBox } from '../contracts/geometry.ts';

export const EMPTY_BBOX: BBox = { x: 0, y: 0, width: 0, height: 0 };

export function makeBBox(x0: number, y0: number, x1: number, y1: number): BBox {
  const minX = Math.min(x0, x1);
  const minY = Math.min(y0, y1);
  return { x: minX, y: minY, width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

export const right = (b: BBox): number => b.x + b.width;
export const bottom = (b: BBox): number => b.y + b.height;
export const centerX = (b: BBox): number => b.x + b.width / 2;
export const centerY = (b: BBox): number => b.y + b.height / 2;
export const area = (b: BBox): number => b.width * b.height;

export function unionBBox(boxes: readonly BBox[]): BBox {
  if (boxes.length === 0) return EMPTY_BBOX;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (right(b) > maxX) maxX = right(b);
    if (bottom(b) > maxY) maxY = bottom(b);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function intersectionArea(a: BBox, b: BBox): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** a 被 b 覆盖的比例 */
export function coverage(a: BBox, b: BBox): number {
  const s = area(a);
  return s <= 0 ? 0 : intersectionArea(a, b) / s;
}

export function contains(outer: BBox, inner: BBox, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    right(inner) <= right(outer) + tolerance &&
    bottom(inner) <= bottom(outer) + tolerance
  );
}

/** 一维区间重叠长度占较短区间的比例 */
export function overlapRatio1D(a0: number, a1: number, b0: number, b1: number): number {
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  if (overlap <= 0) return 0;
  const shorter = Math.min(a1 - a0, b1 - b0);
  return shorter <= 0 ? 0 : overlap / shorter;
}
