import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageNote, ProcessResult } from '../core/image/compress.ts';
import { decodeWithImage } from '../core/image/dom-decode.ts';
import { limitPlan, outputName, planResize } from '../core/image/plan.ts';
import type { EncodeFormat, ImageJobOptions } from '../core/image/plan.ts';
import { displaySize, sniffImage } from '../core/image/sniff.ts';
import type { ImageHeader } from '../core/image/sniff.ts';
import { renderSvg, svgIntrinsicSize } from '../core/image/svg.ts';
import { relativePathOf } from '../ui/files.ts';
import { ImageJobError, processInWorker } from '../ui/image-client.ts';
import type { ImageFailure } from '../worker/image-protocol.ts';

export type ImageStatus = 'ready' | 'processing' | 'done' | 'kept' | 'skipped' | 'failed';

export interface ImageItemResult {
  readonly blob: Blob;
  readonly url: string;
  readonly name: string;
  readonly format: EncodeFormat;
  readonly width: number;
  readonly height: number;
  readonly kept: boolean;
  readonly notes: readonly ImageNote[];
}

export interface ImageItem {
  readonly id: string;
  readonly file: File;
  /** 文件夹里的相对路径，单独选的文件为空串 */
  readonly path: string;
  readonly url: string;
  readonly header: ImageHeader | null;
  /** 浏览器能不能直接显示（缩略图和对比用） */
  readonly previewable: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly status: ImageStatus;
  readonly result?: ImageItemResult;
  readonly error?: ImageFailure;
  readonly detail?: string;
}

/** 失败了值得再试一次的：内存不够、Worker 崩了、编码失败、没见过的错误；读不了的格式重试也没用 */
export const retryable = (error: ImageFailure | undefined): boolean =>
  error === 'memory' || error === 'crashed' || error === 'unknown' || error === 'encode';

export const isSvgItem = (item: ImageItem): boolean =>
  item.header?.format === 'svg' || item.file.type === 'image/svg+xml';

/** 加图或改设置后稍等一下再开始：连着拖几批、连着点几下设置时只处理一遍 */
const AUTO_START_MS = 300;

let seq = 0;

const revoke = (item: ImageItem): void => {
  URL.revokeObjectURL(item.url);
  if (item.result !== undefined) URL.revokeObjectURL(item.result.url);
};

interface Options {
  readonly prefix: string;
  /** 这一批的处理参数；变了就作废已有结果、按新参数重做 */
  readonly job: ImageJobOptions;
  readonly maxPixels: number;
  /** 最多同时处理几张；内存由 Worker 池按像素预算兜底 */
  readonly lanes: number;
}

/**
 * 图片工具的一批图：加进来就自动在 Worker 里处理（按顺序取，最多同时 lanes 张）；处理参数变了，已有结果作废并重做。
 * 「停止」之后不再自动开始，直到加图、改设置或「继续」。
 * 设置每改一次代数加一，上一轮还没写回的结果按代数丢弃，不会把旧设置的结果写到新列表里。
 */
export function useImageBatch({ prefix, job, maxPixels, lanes }: Options) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const sniffing = useRef<Promise<void>>(Promise.resolve());
  const jobRef = useRef(job);
  jobRef.current = job;
  const jobKey = JSON.stringify(job);

  const patch = useCallback((id: string, fn: (item: ImageItem) => ImageItem) => {
    setItems((prev) => prev.map((item) => (item.id === id ? fn(item) : item)));
  }, []);

  /** 正在跑的这一轮作废，已有结果放回待处理（读不了的格式不用重来） */
  const invalidate = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    setItems((prev) =>
      prev.map((item) => {
        if (item.status === 'ready' || item.status === 'skipped') return item;
        if (item.status === 'failed' && !retryable(item.error)) return item;
        if (item.result !== undefined) URL.revokeObjectURL(item.result.url);
        return { ...item, status: 'ready', result: undefined, error: undefined, detail: undefined };
      }),
    );
  }, []);

  // 处理参数变了（第一次渲染不算）：作废结果、取消暂停
  const lastJob = useRef(jobKey);
  useEffect(() => {
    if (lastJob.current === jobKey) return;
    lastJob.current = jobKey;
    invalidate();
    setPaused(false);
  }, [invalidate, jobKey]);

  const add = useCallback(
    (files: readonly File[]): void => {
      if (files.length === 0) return;
      const created: ImageItem[] = files.map((file) => ({
        id: `${prefix}-${seq++}`,
        file,
        path: relativePathOf(file),
        url: URL.createObjectURL(file),
        header: null,
        previewable: true,
        status: 'ready',
      }));
      setItems((prev) => [...prev, ...created]);
      setPaused(false);
      // 只读文件头：格式、尺寸、是不是动图，列表里先显示出来。
      // 一张接一张读，几百张一起拖进来时不会同时占几百 MB 内存
      for (const item of created) {
        sniffing.current = sniffing.current.then(async () => {
          try {
            const buffer = await item.file.slice(0, 512 * 1024).arrayBuffer();
            const header = sniffImage(new Uint8Array(buffer));
            const shown = displaySize(header);
            patch(item.id, (current) => ({
              ...current,
              header,
              width: current.width ?? shown?.width,
              height: current.height ?? shown?.height,
              ...(header.animated && current.status === 'ready'
                ? { status: 'skipped' as const, error: 'animated' as const }
                : {}),
            }));
          } catch {
            /* 读不了的文件交给处理时再报错 */
          }
        });
      }
    },
    [patch, prefix],
  );

  const remove = useCallback((id: string): void => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target !== undefined) revoke(target);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const clear = useCallback((): void => {
    generation.current++;
    controller.current?.abort();
    for (const item of itemsRef.current) revoke(item);
    setItems([]);
    setPaused(false);
  }, []);

  const retry = useCallback(
    (id: string): void => {
      patch(id, (current) => ({
        ...current,
        status: 'ready',
        error: undefined,
        detail: undefined,
      }));
      setPaused(false);
    },
    [patch],
  );

  const stop = useCallback((): void => {
    setPaused(true);
    controller.current?.abort();
  }, []);

  const resume = useCallback((): void => setPaused(false), []);

  /** 处理一张：SVG 先在主线程按最终尺寸画成 PNG；Worker 解不了的再用 <img> 兜底一次 */
  const processOne = useCallback(
    async (
      item: ImageItem,
      options: ImageJobOptions,
      signal: AbortSignal,
    ): Promise<ProcessResult> => {
      if (isSvgItem(item)) {
        const intrinsic = svgIntrinsicSize(await item.file.text());
        const plan = limitPlan(planResize(intrinsic, options, true), maxPixels);
        const canvas = await renderSvg(item.file, plan, intrinsic, signal);
        const png = await canvas.convertToBlob({ type: 'image/png' });
        canvas.width = 0;
        canvas.height = 0;
        return processInWorker(
          {
            file: png,
            options,
            maxPixels,
            rasterized: { format: 'svg', sized: true },
            pixels: plan.width * plan.height,
          },
          signal,
        );
      }
      // 文件头里读到了尺寸就按它给 Worker 池记账，读不到按单张上限算
      const pixels =
        item.width !== undefined && item.height !== undefined
          ? item.width * item.height
          : undefined;
      try {
        return await processInWorker({ file: item.file, options, maxPixels, pixels }, signal);
      } catch (error) {
        // Worker 解不了、但 <img> 也许能显示（Safari 的 HEIC、TIFF）：主线程画成 PNG 再试一次
        if (!(error instanceof ImageJobError && error.code === 'decode')) throw error;
        const png = await decodeWithImage(item.file, maxPixels, signal).catch(() => {
          throw error;
        });
        return processInWorker(
          {
            file: png,
            options,
            maxPixels,
            rasterized: { format: item.header?.format ?? 'unknown', sized: false },
          },
          signal,
        );
      }
    },
    [maxPixels],
  );

  /** 处理一张并把结果写回列表；出错也在这里落定，不往外抛 */
  const settleOne = useCallback(
    async (item: ImageItem, options: ImageJobOptions, signal: AbortSignal, gen: number) => {
      patch(item.id, (current) => ({ ...current, status: 'processing' }));
      try {
        const result = await processOne(item, options, signal);
        if (gen !== generation.current) return;
        patch(item.id, (current) => ({
          ...current,
          status: result.kept ? 'kept' : 'done',
          width: current.width ?? result.sourceWidth,
          height: current.height ?? result.sourceHeight,
          result: {
            blob: result.blob,
            url: URL.createObjectURL(result.blob),
            name: outputName(item.file.name, result.format),
            format: result.format,
            width: result.width,
            height: result.height,
            kept: result.kept,
            notes: result.notes,
          },
        }));
      } catch (error) {
        if (signal.aborted || gen !== generation.current) {
          // 用户点了停止：这张放回待处理；改设置引起的中断，invalidate 已经处理过
          if (gen === generation.current) {
            patch(item.id, (current) => ({ ...current, status: 'ready' }));
          }
          return;
        }
        const code: ImageFailure =
          error instanceof ImageJobError ? error.code : isSvgItem(item) ? 'decode' : 'unknown';
        patch(item.id, (current) => ({
          ...current,
          status: code === 'animated' ? 'skipped' : 'failed',
          error: code,
          detail: error instanceof Error ? error.message : String(error),
        }));
      }
    },
    [patch, processOne],
  );

  const run = useCallback(async (): Promise<void> => {
    if (controller.current !== null) return;
    const abort = new AbortController();
    controller.current = abort;
    const gen = generation.current;
    const options = jobRef.current;
    /** 列表快照要等下一次渲染才更新，处理过的记下来，免得同一张取两遍 */
    const seen = new Set<string>();
    const inflight = new Set<Promise<void>>();
    setRunning(true);
    try {
      for (;;) {
        if (abort.signal.aborted || gen !== generation.current) break;
        // 处理途中新拖进来的图也会在这一轮里接着处理
        const item = itemsRef.current.find((each) => each.status === 'ready' && !seen.has(each.id));
        // 没有可取的、或者同时处理的张数满了：等手上的某一张做完再看
        if (item === undefined || inflight.size >= lanes) {
          if (inflight.size === 0) break;
          await Promise.race(inflight);
          continue;
        }
        seen.add(item.id);
        const task = settleOne(item, options, abort.signal, gen).finally(() => {
          inflight.delete(task);
        });
        inflight.add(task);
      }
      await Promise.all(inflight);
    } finally {
      if (controller.current === abort) controller.current = null;
      setRunning(false);
    }
  }, [lanes, settleOne]);

  // 有待处理的图就自动开始：拖进来、改了设置、点了「继续」都走这里
  const pending = items.filter((item) => item.status === 'ready').length;
  useEffect(() => {
    if (paused || running || pending === 0) return;
    const timer = setTimeout(() => void run(), AUTO_START_MS);
    return () => clearTimeout(timer);
  }, [paused, pending, run, running]);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  return {
    items,
    patch,
    add,
    remove,
    clear,
    retry,
    stop,
    resume,
    pending,
    /** 正在处理，或者有图马上就要开始处理 */
    busy: running || (pending > 0 && !paused),
    /** 已经有了结局的张数：完成、保留原图、跳过、失败 */
    settled: items.filter((item) => item.status !== 'ready' && item.status !== 'processing').length,
    finished: items.filter((item) => item.result !== undefined),
  };
}
