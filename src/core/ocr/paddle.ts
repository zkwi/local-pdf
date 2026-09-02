import type { OcrResultItem } from '@paddleocr/paddleocr-js';
import type { OcrLanguage, OcrQuality } from '../contracts/options.ts';
import type { PrimitiveTextSpan } from '../contracts/primitives.ts';
import { makeBBox } from '../geometry/bbox.ts';
import { sanitizeText } from '../util/sanitize.ts';
import type { OcrEngine, OcrEngineContext } from './engine.ts';
import { loadModel } from './model-cache.ts';
import { formatMegabytes, localModelUrl, selectPaddleModels } from './paddle-models.ts';

export interface PaddleEngineOptions extends OcrEngineContext {
  readonly quality: OcrQuality;
  readonly language: OcrLanguage;
}

export interface PaddleEngine extends OcrEngine {
  /** 校验值对不上的模型名，由上层决定要不要提示 */
  readonly unverifiedModels: readonly string[];
}

/**
 * ONNX Runtime 的 wasm 要和 SDK 打进来的 ORT 版本一致。
 * 优先用应用自己目录下的 public/ort/（npm run ocr-runtime 复制），没有就从 jsDelivr 按精确版本号取——
 * 26.5 MiB 的 wasm 超过了 Cloudflare Pages 等静态托管 25 MiB 的单文件上限，默认不能随站点一起发布。
 */
const ORT_DIR = 'ort/';
const ORT_WASM = 'ort-wasm-simd-threaded.jsep.wasm';
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${__ORT_VERSION__}/dist/`;
let ortBasePromise: Promise<string> | null = null;

async function resolveOrtBase(assetBase: string): Promise<string> {
  ortBasePromise ??= (async () => {
    const local = `${assetBase}${ORT_DIR}`;
    try {
      const response = await fetch(`${local}${ORT_WASM}`, { method: 'HEAD', cache: 'no-store' });
      const type = response.headers.get('content-type') ?? '';
      if (response.ok && !type.includes('text/html')) return local;
    } catch {
      /* 本地没有就走 CDN */
    }
    return ORT_CDN;
  })();
  return ortBasePromise;
}

/**
 * PaddleOCR.js 适配器。
 *
 * 拓扑：转换 Worker 里调用 SDK 的 worker:true 模式，SDK 再开一个嵌套 Worker 跑 ONNX Runtime。
 * 直连模式（worker:false）在 Worker 里跑不了——它把 ImageBitmap 转 Mat 时用的是 document.createElement。
 * 嵌套 Worker 在 Chromium / Firefox / Safari 16+ 都可用，第一版用别的引擎时已经在这个应用里验证过。
 *
 * 模型不交给 SDK 自己下载，而是我们先流式下载（报进度、进 Cache Storage），
 * 再以 blob: URL 交给 SDK，这样断网也能命中缓存。
 */
export async function createPaddleEngine(options: PaddleEngineOptions): Promise<PaddleEngine> {
  const selection = selectPaddleModels(options.quality, options.language);
  const progress = options.onProgress ?? (() => undefined);
  const blobUrls: string[] = [];
  const unverified: string[] = [];

  let downloadedBefore = 0;
  const modelUrl = async (spec: typeof selection.det): Promise<string> => {
    const loaded = await loadModel(
      spec,
      localModelUrl(options.assetBase, spec),
      (p) => {
        const overall = (downloadedBefore + p.loaded) / selection.totalBytes;
        progress({
          key: 'ocr-model-download',
          progress: Math.min(1, overall) * 0.85,
          params: {
            loaded: formatMegabytes(downloadedBefore + p.loaded),
            total: formatMegabytes(selection.totalBytes),
          },
        });
      },
      options.signal,
    );
    downloadedBefore += spec.bytes;
    if (!loaded.verified) unverified.push(spec.name);
    const url = URL.createObjectURL(loaded.blob);
    blobUrls.push(url);
    return url;
  };

  const detUrl = await modelUrl(selection.det);
  const recUrl = await modelUrl(selection.rec);

  progress({ key: 'ocr-model-init', progress: 0.9 });
  const [{ PaddleOCR }, wasmPaths] = await Promise.all([
    import('@paddleocr/paddleocr-js'),
    resolveOrtBase(options.assetBase),
  ]);

  const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const ocr = await PaddleOCR.create({
    worker: true,
    lang: selection.lang,
    ocrVersion: 'PP-OCRv6',
    textDetectionModelName: selection.det.name,
    textRecognitionModelName: selection.rec.name,
    textDetectionModelAsset: { url: detUrl },
    textRecognitionModelAsset: { url: recUrl },
    ortOptions: {
      backend: 'wasm',
      wasmPaths,
      // 多线程 wasm 需要 COOP/COEP，没有隔离时只能单线程
      numThreads: isolated ? Math.max(1, Math.min(4, cores - 1)) : 1,
      simd: true,
    },
    unsupportedBehavior: 'warn',
  });
  progress({ key: 'ocr-model-ready', progress: 1 });

  const release = (): void => {
    for (const url of blobUrls) URL.revokeObjectURL(url);
    blobUrls.length = 0;
  };

  return {
    name: selection.label,
    unverifiedModels: unverified,
    async recognize(canvas, scale, pageIndex) {
      const bitmap = await createImageBitmap(canvas);
      try {
        const results = await ocr.predict(bitmap);
        return paddleItemsToSpans(results[0]?.items ?? [], scale, pageIndex);
      } finally {
        try {
          bitmap.close();
        } catch {
          /* SDK 可能已经把它转走了 */
        }
      }
    },
    async terminate() {
      release();
      await ocr.dispose();
    },
  };
}

/**
 * PaddleOCR 返回的是整行文本 + 四边形框（栅格像素）。
 * 渲染用的是 pdf.js viewport，六个矩阵分量都正比于 scale，所以除以 scale 就是精确的页面坐标。
 */
export function paddleItemsToSpans(
  items: readonly OcrResultItem[],
  scale: number,
  pageIndex: number,
): PrimitiveTextSpan[] {
  const spans: PrimitiveTextSpan[] = [];
  let seq = 0;
  for (const item of items) {
    const text = sanitizeText(item.text).trim();
    if (text === '' || item.poly.length < 2) continue;
    const xs = item.poly.map((p) => p[0] / scale);
    const ys = item.poly.map((p) => p[1] / scale);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const height = Math.max(1, y1 - y0);
    const width = Math.max(1, x1 - x0);

    // 检测框沿首边的倾角；接近竖直的当竖排
    const [p0, p1] = item.poly;
    const angle = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
    const rotation = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
    const vertical = rotation === 90 || rotation === 270;

    spans.push({
      id: `p${pageIndex}-ocr${seq++}`,
      pageIndex,
      text,
      bbox: makeBBox(x0, y0, x1, y1),
      // 检测框贴着字形外沿，基线大致在框底往上五分之一处
      baseline: y1 - height * 0.2,
      fontSize: vertical ? Math.max(1, width) * 0.9 : height * 0.9,
      fontKey: 'ocr',
      fontName: 'OCR',
      fontFamily: 'sans-serif',
      bold: false,
      italic: false,
      rotation,
      vertical,
      source: 'ocr',
      confidence: Math.max(0, Math.min(1, item.score)),
      hasEOL: true,
    });
  }
  // 先按行再按列，给后续行聚类一个稳定的输入顺序
  return spans.sort((a, b) => a.baseline - b.baseline || a.bbox.x - b.bbox.x);
}
