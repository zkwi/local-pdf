import { OPS, Util } from 'pdfjs-dist';
import type { BBox } from '../contracts/geometry.ts';
import type { PrimitiveImage, PrimitiveSegment } from '../contracts/primitives.ts';
import { makeBBox } from '../geometry/bbox.ts';

/** pdf.js 内部的路径指令编码（DrawOPS，未导出，取值见 pdf.mjs 中的 DrawOPS 常量） */
const DRAW_MOVE_TO = 0;
const DRAW_LINE_TO = 1;
const DRAW_CURVE_TO = 2;
const DRAW_QUADRATIC_CURVE_TO = 3;
const DRAW_CLOSE_PATH = 4;

/** 判定为"细线"的最大厚度（pt）；表格框线通常不超过 2pt */
const MAX_RULE_THICKNESS = 3;
/** 有效线段最小长度（pt），过滤下划线碎片与噪点 */
const MIN_RULE_LENGTH = 8;
/** 轴对齐判定容差（pt） */
const AXIS_TOLERANCE = 0.8;

type Matrix = [number, number, number, number, number, number];

interface Subpath {
  points: number[];
  hasCurve: boolean;
}

export interface PageGraphics {
  readonly segments: PrimitiveSegment[];
  readonly images: PrimitiveImage[];
  readonly fontKeys: string[];
  /** 以不可见模式（渲染模式 3 / 7）画的文字操作数，可搜索扫描件的文字层全是这种 */
  readonly hiddenTextOps: number;
  readonly visibleTextOps: number;
}

interface OperatorListLike {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** 把扁平的 DrawOPS 数组解成若干子路径；曲线只保留端点并打标，避免被误判成直线 */
export function decodeDrawOps(data: ArrayLike<number>): Subpath[] {
  const paths: Subpath[] = [];
  let current: Subpath | null = null;
  let startX = 0;
  let startY = 0;

  const ensure = (x: number, y: number): Subpath => {
    if (current === null) {
      current = { points: [x, y], hasCurve: false };
      paths.push(current);
    }
    return current;
  };

  for (let i = 0; i < data.length;) {
    const op = data[i++];
    switch (op) {
      case DRAW_MOVE_TO: {
        startX = data[i++];
        startY = data[i++];
        current = { points: [startX, startY], hasCurve: false };
        paths.push(current);
        break;
      }
      case DRAW_LINE_TO: {
        const x = data[i++];
        const y = data[i++];
        ensure(x, y).points.push(x, y);
        break;
      }
      case DRAW_CURVE_TO: {
        i += 4;
        const x = data[i++];
        const y = data[i++];
        const sp = ensure(x, y);
        sp.points.push(x, y);
        sp.hasCurve = true;
        break;
      }
      case DRAW_QUADRATIC_CURVE_TO: {
        i += 2;
        const x = data[i++];
        const y = data[i++];
        const sp = ensure(x, y);
        sp.points.push(x, y);
        sp.hasCurve = true;
        break;
      }
      case DRAW_CLOSE_PATH: {
        if (current !== null) current.points.push(startX, startY);
        break;
      }
      default:
        // 未知指令：无法继续按偏移安全解析，放弃剩余部分
        return paths;
    }
  }
  return paths;
}

function pushSegment(
  out: PrimitiveSegment[],
  pageIndex: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  thickness: number,
): void {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  if (dy <= AXIS_TOLERANCE && dx >= MIN_RULE_LENGTH) {
    out.push({
      id: `p${pageIndex}-seg${out.length}`,
      pageIndex,
      orientation: 'horizontal',
      start: Math.min(ax, bx),
      end: Math.max(ax, bx),
      position: (ay + by) / 2,
      thickness,
    });
  } else if (dx <= AXIS_TOLERANCE && dy >= MIN_RULE_LENGTH) {
    out.push({
      id: `p${pageIndex}-seg${out.length}`,
      pageIndex,
      orientation: 'vertical',
      start: Math.min(ay, by),
      end: Math.max(ay, by),
      position: (ax + bx) / 2,
      thickness,
    });
  }
}

/** 填充路径只有本身就是细长条时才算框线，避免把单元格底色的四条边当成表格线 */
function pushFilledSubpath(out: PrimitiveSegment[], pageIndex: number, device: number[]): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < device.length; i += 2) {
    minX = Math.min(minX, device[i]);
    maxX = Math.max(maxX, device[i]);
    minY = Math.min(minY, device[i + 1]);
    maxY = Math.max(maxY, device[i + 1]);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (h <= MAX_RULE_THICKNESS && w >= MIN_RULE_LENGTH) {
    const y = (minY + maxY) / 2;
    pushSegment(out, pageIndex, minX, y, maxX, y, Math.max(h, 0.5));
  } else if (w <= MAX_RULE_THICKNESS && h >= MIN_RULE_LENGTH) {
    const x = (minX + maxX) / 2;
    pushSegment(out, pageIndex, x, minY, x, maxY, Math.max(w, 0.5));
  }
}

const STROKE_OPS: ReadonlySet<number> = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);

const IMAGE_OPS: ReadonlySet<number> = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
]);

const MASK_OPS: ReadonlySet<number> = new Set<number>([
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectRepeat,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintSolidColorImageMask,
]);

function isFlatNumberArray(value: unknown): value is ArrayLike<number> {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

/**
 * 遍历一页的操作符列表，维护 CTM，抽出：
 * - 轴对齐直线段（有线表格的识别依据）
 * - 图像占位框（PDF 图像画在单位方框里，经 CTM 变换即为实际位置）
 * - 用到的字体 key（之后到 commonObjs 查真实字体名与粗斜体）
 */
const TEXT_OPS = new Set<number>([
  OPS.showText,
  OPS.showSpacedText,
  OPS.nextLineShowText,
  OPS.nextLineSetSpacingShowText,
]);

export function walkOperatorList(
  opList: OperatorListLike,
  baseTransform: readonly number[],
  pageIndex: number,
): PageGraphics {
  const segments: PrimitiveSegment[] = [];
  const images: PrimitiveImage[] = [];
  const fontKeys = new Set<string>();

  let ctm = [...baseTransform] as Matrix;
  const stack: { ctm: Matrix; renderMode: number }[] = [];
  let lineWidth = 1;
  // 文字渲染模式属于图形状态，随 q/Q 保存恢复；3 和 7 是不可见文字
  let renderMode = 0;
  let hiddenTextOps = 0;
  let visibleTextOps = 0;

  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | null | undefined;

    if (fn === OPS.save) {
      stack.push({ ctm: [...ctm] as Matrix, renderMode });
    } else if (fn === OPS.restore) {
      const prev = stack.pop();
      if (prev) {
        ctm = prev.ctm;
        renderMode = prev.renderMode;
      }
    } else if (fn === OPS.setTextRenderingMode && args) {
      renderMode = Number(args[0]) || 0;
    } else if (TEXT_OPS.has(fn)) {
      if (renderMode === 3 || renderMode === 7) hiddenTextOps++;
      else visibleTextOps++;
    } else if (fn === OPS.transform && args) {
      ctm = Util.transform(ctm, args as number[]) as Matrix;
    } else if (fn === OPS.setLineWidth && args) {
      lineWidth = Number(args[0]) || 1;
    } else if (fn === OPS.setFont && args) {
      const key = args[0];
      if (typeof key === 'string') fontKeys.add(key);
    } else if (fn === OPS.constructPath && args) {
      collectPath(segments, pageIndex, args, ctm, lineWidth);
    } else if (IMAGE_OPS.has(fn) || MASK_OPS.has(fn)) {
      const bbox = unitSquareBBox(ctm);
      if (bbox.width > 1 && bbox.height > 1) {
        images.push({
          id: `p${pageIndex}-img${images.length}`,
          pageIndex,
          bbox,
          isMask: MASK_OPS.has(fn),
        });
      }
    }
  }

  return { segments, images, fontKeys: [...fontKeys], hiddenTextOps, visibleTextOps };
}

function collectPath(
  segments: PrimitiveSegment[],
  pageIndex: number,
  args: unknown[],
  ctm: Matrix,
  lineWidth: number,
): void {
  const paintOp = Number(args[0]);
  const data = args[1] as unknown[] | undefined;
  const raw = data?.[0];
  // 页面被渲染过之后 data[0] 会被替换成 Path2D，此时无法再解析，直接跳过
  if (!isFlatNumberArray(raw)) return;

  const subpaths = decodeDrawOps(raw);
  const scale = Math.hypot(ctm[0], ctm[1]) || 1;
  const deviceThickness = Math.max(0.5, lineWidth * scale);
  const stroked = STROKE_OPS.has(paintOp);

  for (const sp of subpaths) {
    if (sp.hasCurve) continue;
    const device: number[] = [];
    for (let p = 0; p < sp.points.length; p += 2) {
      const pt = applyMatrix(ctm, sp.points[p], sp.points[p + 1]);
      device.push(pt.x, pt.y);
    }
    if (device.length < 4) continue;
    if (stroked) {
      for (let p = 0; p + 3 < device.length; p += 2) {
        pushSegment(
          segments,
          pageIndex,
          device[p],
          device[p + 1],
          device[p + 2],
          device[p + 3],
          deviceThickness,
        );
      }
    } else {
      pushFilledSubpath(segments, pageIndex, device);
    }
  }
}

function unitSquareBBox(m: Matrix): BBox {
  const p0 = applyMatrix(m, 0, 0);
  const p1 = applyMatrix(m, 1, 0);
  const p2 = applyMatrix(m, 1, 1);
  const p3 = applyMatrix(m, 0, 1);
  const xs = [p0.x, p1.x, p2.x, p3.x];
  const ys = [p0.y, p1.y, p2.y, p3.y];
  return makeBBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}
