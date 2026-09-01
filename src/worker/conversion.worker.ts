/// <reference lib="webworker" />
import { CancelledError, convert } from '../core/converter/convert.ts';
import type { WorkerErrorCode, WorkerRequest, WorkerResponse } from './protocol.ts';

const controllers = new Map<string, AbortController>();
/** 串行处理，避免多份大文档同时占内存 */
let queue: Promise<void> = Promise.resolve();

const post = (message: WorkerResponse): void => {
  self.postMessage(message);
};

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;
  if (request.type === 'cancel') {
    controllers.get(request.jobId)?.abort();
    return;
  }
  if (request.type !== 'convert') return;

  const controller = new AbortController();
  controllers.set(request.jobId, controller);

  queue = queue.then(async () => {
    if (controller.signal.aborted) {
      controllers.delete(request.jobId);
      post({ type: 'error', jobId: request.jobId, code: 'cancelled', message: '转换已取消' });
      return;
    }
    try {
      const result = await convert(
        {
          data: request.buffer,
          fileName: request.fileName,
          options: request.options,
          assetBase: request.assetBase,
        },
        {
          signal: controller.signal,
          onProgress: (progress) => post({ type: 'progress', jobId: request.jobId, progress }),
        },
      );
      post({
        type: 'done',
        jobId: request.jobId,
        blob: result.blob,
        fileName: result.fileName,
        report: result.report,
      });
    } catch (error) {
      const { code, message } = classify(error);
      post({ type: 'error', jobId: request.jobId, code, message });
    } finally {
      controllers.delete(request.jobId);
    }
  });
};

function classify(error: unknown): { code: WorkerErrorCode; message: string } {
  if (error instanceof CancelledError) return { code: 'cancelled', message: '转换已取消' };

  const name = error instanceof Error ? error.name : '';
  const raw = error instanceof Error ? error.message : String(error);

  if (name === 'PasswordException') {
    const incorrect = /incorrect/i.test(raw);
    return {
      code: incorrect ? 'password-incorrect' : 'password-required',
      message: incorrect ? '密码不正确' : '这份 PDF 有密码，请输入打开密码',
    };
  }
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(raw)) {
    return { code: 'invalid-pdf', message: '文件不是有效的 PDF，或已损坏' };
  }
  return { code: 'unknown', message: raw || '转换失败' };
}
