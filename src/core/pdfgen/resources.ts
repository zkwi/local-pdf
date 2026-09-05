/** 排版资源只能来自当前浏览器里的图片，不能由文档触发网络读取。 */
export function isLocalImageSource(src: string): boolean {
  return (
    /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon)(?:;|,)/i.test(src) ||
    /^blob:/i.test(src)
  );
}

export function unsupportedImageFormat(src: string): string | null {
  const type = /^data:([^;,]+)/i.exec(src)?.[1]?.toLowerCase();
  if (type?.includes('emf')) return 'EMF';
  if (type?.includes('wmf')) return 'WMF';
  return null;
}

/** 取消和超时都要清理监听器；底层解码无法中断时，也不再占用队列。 */
export function waitForResource<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (action: () => void): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      action();
    };
    const abort = (): void =>
      finish(() => reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError')));
    const timer = setTimeout(
      () => finish(() => reject(new DOMException('Resource wait timed out', 'TimeoutError'))),
      timeoutMs,
    );
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
    if (signal?.aborted) abort();
  });
}
