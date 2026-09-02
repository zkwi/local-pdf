import type { WorkerError } from './protocol.ts';

/** 浏览器 / V8 / wasm 在内存耗尽时的几种说法 */
const OUT_OF_MEMORY =
  /out of memory|allocation failed|cannot enlarge memory|invalid array length|wasm memory|memory access out of bounds|\boom\b/i;

/** 把转换流水线抛出的任意错误归到界面认识的几个错误码 */
export function classifyError(error: unknown, aborted: boolean): WorkerError {
  const name = error instanceof Error ? error.name : '';
  // 取消时模型下载会以 AbortError 抛出，统一归到 cancelled
  if (name === 'CancelledError' || aborted) return { code: 'cancelled' };

  const raw = error instanceof Error ? error.message : String(error);
  if (name === 'PasswordException') {
    return { code: /incorrect/i.test(raw) ? 'password-incorrect' : 'password-required' };
  }
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(raw)) {
    return { code: 'invalid-pdf' };
  }
  if (OUT_OF_MEMORY.test(raw)) return { code: 'out-of-memory', detail: raw };
  return { code: 'unknown', detail: raw };
}
