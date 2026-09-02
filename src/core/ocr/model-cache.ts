import type { PaddleModelSpec } from './paddle-models.ts';

/**
 * OCR 模型的下载与缓存。
 * 不指望浏览器 HTTP 缓存（随时会被清掉，也拿不到进度），
 * 而是自己流式下载、报进度，然后放进 Cache Storage：下次直接命中，断网也能用。
 * 主线程和 Worker 都能调用。
 */
const CACHE_NAME = 'local-pdf-ocr-models-v1';

export interface DownloadProgress {
  readonly loaded: number;
  readonly total: number;
}

export type ModelSource = 'cache' | 'local' | 'official';

export interface ModelLoadResult {
  readonly blob: Blob;
  readonly source: ModelSource;
  readonly verified: boolean;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    // 隐私模式等场景下 Cache Storage 不可用，退化成不缓存
    return null;
  }
}

/** 本地静态目录里有没有这份模型。dev/preview 对未知路径会回落到 index.html，所以要看 content-type */
async function localAssetExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) return false;
    const type = response.headers.get('content-type') ?? '';
    return !type.includes('text/html');
  } catch {
    return false;
  }
}

export async function fetchWithProgress(
  url: string,
  expectedBytes: number,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  // 不走 HTTP 缓存：官方源的 Access-Control-Allow-Origin 按请求 Origin 回显且没有 Vary: Origin，
  // 被浏览器/代理缓存后换个来源就会 CORS 失败。我们自己有 Cache Storage，不需要它。
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || expectedBytes;
  const reader = response.body?.getReader();
  if (reader === undefined) {
    const blob = await response.blob();
    onProgress({ loaded: blob.size, total: blob.size });
    return blob;
  }

  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as BlobPart);
    loaded += value.byteLength;
    onProgress({ loaded, total: Math.max(total, loaded) });
  }
  return new Blob(chunks, { type: 'application/octet-stream' });
}

async function sha256Hex(blob: Blob): Promise<string | null> {
  if (typeof crypto === 'undefined' || crypto.subtle === undefined) return null;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 按「缓存 → 本地自托管 → 官方源」的顺序取模型。
 * 缓存键统一用官方 URL，本地和官方下载的同一份模型共用一条缓存。
 */
export async function loadModel(
  model: PaddleModelSpec,
  localUrl: string,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<ModelLoadResult> {
  const cache = await openCache();
  const cached = await cache?.match(model.officialUrl);
  if (cached !== undefined && cached !== null) {
    const blob = await cached.blob();
    onProgress({ loaded: blob.size, total: blob.size });
    return { blob, source: 'cache', verified: true };
  }

  const useLocal = await localAssetExists(localUrl);
  const url = useLocal ? localUrl : model.officialUrl;
  const blob = await fetchWithProgress(url, model.bytes, onProgress, signal);

  const hash = await sha256Hex(blob);
  const verified = hash === null ? blob.size === model.bytes : hash === model.sha256;
  if (verified && cache !== null) {
    try {
      await cache.put(
        model.officialUrl,
        new Response(blob, {
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(blob.size),
          },
        }),
      );
    } catch {
      // 配额不够就算了，下次再下
    }
  }
  return { blob, source: useLocal ? 'local' : 'official', verified };
}

/** 已缓存的模型总字节数，供界面显示 */
export async function cachedModelBytes(): Promise<number> {
  const cache = await openCache();
  if (cache === null) return 0;
  let total = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    total += Number(response?.headers.get('content-length')) || 0;
  }
  return total;
}

export async function clearModelCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* ignore */
  }
}
