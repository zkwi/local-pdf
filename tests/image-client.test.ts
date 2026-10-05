import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageJobOptions } from '../src/core/image/plan.ts';

/** 假 Worker：记下收到的任务，测试里手动让它做完或崩掉 */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;
  readonly posted: { id: number }[] = [];
  terminated = false;

  constructor() {
    FakeWorker.all.push(this);
  }

  postMessage(message: { id: number }): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  finish(): void {
    const id = this.posted.at(-1)?.id;
    this.onmessage?.({ data: { type: 'done', id, result: { id } } });
  }

  crash(): void {
    this.onerror?.({ message: 'out of memory', preventDefault: () => {} });
  }
}

/** 已经交给某个 Worker 的任务 id，按开始的先后 */
const started = (): number[] =>
  FakeWorker.all.flatMap((w) => w.posted.map((m) => m.id)).sort((a, b) => a - b);
const job = (pixels: number) => ({
  file: new Blob(),
  options: {} as ImageJobOptions,
  maxPixels: 50,
  pixels,
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
  // Worker 池是模块级的，每个用例重新载入一份
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('图片 Worker 池', () => {
  it('同时处理的像素不超过单张上限，排头放不下就等，后面的小图不插队', async () => {
    const { processInWorker } = await import('../src/ui/image-client.ts');
    const a = processInWorker(job(10));
    void processInWorker(job(45));
    void processInWorker(job(5));
    // 10 + 45 超过 50：第二张等着，第三张虽然放得下也排在它后面
    expect(started()).toEqual([1]);
    FakeWorker.all[0].finish();
    await expect(a).resolves.toEqual({ id: 1 });
    // 第一张做完：45 开始，45 + 5 正好放得下，一起开始
    expect(started()).toEqual([1, 2, 3]);
  });

  it('最多三个 Worker，做完的 Worker 接着处理排队的', async () => {
    const { processInWorker } = await import('../src/ui/image-client.ts');
    for (let i = 0; i < 4; i++) void processInWorker(job(1));
    expect(FakeWorker.all).toHaveLength(3);
    expect(started()).toEqual([1, 2, 3]);
    FakeWorker.all[1].finish();
    expect(started()).toEqual([1, 2, 3, 4]);
    expect(FakeWorker.all).toHaveLength(3);
    expect(FakeWorker.all[1].posted.map((m) => m.id)).toEqual([2, 4]);
  });

  it('取消正在处理的那张只关掉它的 Worker；取消排队的直接拿掉', async () => {
    const { processInWorker } = await import('../src/ui/image-client.ts');
    const first = new AbortController();
    const queued = new AbortController();
    const a = processInWorker(job(40), first.signal);
    const b = processInWorker(job(40), queued.signal);
    const c = processInWorker(job(40));
    queued.abort();
    await expect(b).rejects.toThrow('cancelled');
    expect(started()).toEqual([1]);
    first.abort();
    await expect(a).rejects.toThrow('cancelled');
    expect(FakeWorker.all[0].terminated).toBe(true);
    // 第三张换一个新 Worker 接着做
    expect(started()).toEqual([1, 3]);
    FakeWorker.all.at(-1)?.finish();
    await expect(c).resolves.toEqual({ id: 3 });
  });

  it('Worker 崩了只算手上这张失败，可以重试', async () => {
    const { ImageJobError, processInWorker } = await import('../src/ui/image-client.ts');
    const a = processInWorker(job(30));
    const b = processInWorker(job(30));
    FakeWorker.all[0].crash();
    const error = await a.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageJobError);
    expect((error as InstanceType<typeof ImageJobError>).code).toBe('crashed');
    await flush();
    expect(started()).toEqual([1, 2]);
    FakeWorker.all.at(-1)?.finish();
    await expect(b).resolves.toEqual({ id: 2 });
  });

  it('不知道像素数时按单张上限算，单独处理', async () => {
    const { processInWorker } = await import('../src/ui/image-client.ts');
    void processInWorker({ ...job(0), pixels: undefined });
    void processInWorker(job(1));
    expect(started()).toEqual([1]);
  });
});
