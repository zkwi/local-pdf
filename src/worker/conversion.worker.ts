/// <reference lib="webworker" />
import { convert } from '../core/converter/convert.ts';
import { classifyError } from './classify.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

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
      post({ type: 'error', jobId: request.jobId, error: { code: 'cancelled' } });
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
        outputs: result.outputs,
        report: result.report,
      });
    } catch (error) {
      post({
        type: 'error',
        jobId: request.jobId,
        error: classifyError(error, controller.signal.aborted),
      });
    } finally {
      controllers.delete(request.jobId);
    }
  });
};
