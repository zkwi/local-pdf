import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';

/**
 * 我们已经在 Web Worker 里了，没必要让 pdf.js 再开一个嵌套 worker
 * （嵌套 Worker 在部分浏览器/隐私模式下不可用）。
 * pdf.js 检测到 globalThis.pdfjsWorker 存在时，会直接在当前上下文里跑 worker 逻辑。
 */
let installed = false;
export function installInContextPdfWorker(): void {
  if (installed) return;
  (globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler: unknown } }).pdfjsWorker = {
    WorkerMessageHandler,
  };
  installed = true;
}

interface CanvasAndContext {
  canvas: OffscreenCanvas | null;
  context: OffscreenCanvasRenderingContext2D | null;
}

/** Worker 里没有 document，用 OffscreenCanvas 顶替 pdf.js 默认的 DOMCanvasFactory */
export class OffscreenCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return { canvas, context };
  }

  reset(cc: CanvasAndContext, width: number, height: number): void {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    cc.canvas.width = width;
    cc.canvas.height = height;
  }

  destroy(cc: CanvasAndContext): void {
    if (cc.canvas) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    }
    cc.canvas = null;
    cc.context = null;
  }
}

/** SVG 滤镜依赖 document，Worker 里一律返回 none（只影响少数图像色彩变换效果） */
export class NoopFilterFactory {
  addFilter(): string {
    return 'none';
  }
  addHCMFilter(): string {
    return 'none';
  }
  addAlphaFilter(): string {
    return 'none';
  }
  addLuminosityFilter(): string {
    return 'none';
  }
  addKnockoutFilter(): string {
    return 'none';
  }
  addHighlightHCMFilter(): string {
    return 'none';
  }
  addSelectionHCMFilter(): string {
    return 'none';
  }
  addSelectionFilter(): string {
    return 'none';
  }
  createSelectionStyle(): null {
    return null;
  }
  destroy(): void {
    /* no-op */
  }
}
