import { useCallback, useEffect, useRef, useState } from 'react';
import type { CjkFont } from '../core/pdfgen/fonts.ts';
import type { HtmlPdfStage, Producer } from '../core/pdfgen/html-to-pdf.ts';
import type { DocMargin } from '../core/pdfgen/markdown.ts';
import { safeBaseName } from '../core/util/filename.ts';

export type DocSource = 'word' | 'markdown';

export interface DocPdfOptions {
  readonly pageSize: 'a4' | 'letter';
  readonly margin: DocMargin;
  /** pt */
  readonly fontSize: number;
  readonly cjk: CjkFont;
}

export const DEFAULT_DOC_OPTIONS: DocPdfOptions = {
  pageSize: 'a4',
  margin: 'normal',
  fontSize: 11,
  cjk: 'zh-CN',
};

export type DocJobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface DocJobResult {
  readonly url: string;
  readonly fileName: string;
  readonly size: number;
  readonly pages: number;
  readonly imagesSkipped: number;
}

export interface DocJob {
  readonly id: string;
  readonly source: DocSource;
  readonly file: File;
  /** Markdown 引用的图片，按文件名 */
  readonly assets: ReadonlyMap<string, Blob>;
  readonly options: DocPdfOptions;
  readonly status: DocJobStatus;
  readonly stage?: HtmlPdfStage;
  readonly fraction: number;
  readonly startedAt?: number;
  readonly finishedAt?: number;
  readonly result?: DocJobResult;
  readonly error?: string;
}

/** 四个阶段在进度条上各占一段 */
const STAGE_BASE: Record<HtmlPdfStage, [number, number]> = {
  render: [0.02, 0.35],
  layout: [0.35, 0.7],
  images: [0.7, 0.9],
  write: [0.9, 1],
};

let seq = 0;
const nextId = (): string => `doc-${Date.now().toString(36)}-${seq++}`;

/** docx-preview 和 remark 只在真要转的时候才下载，首屏不背这几百 KB */
async function producerFor(job: DocJob): Promise<Producer> {
  if (job.source === 'word') {
    const { prepareDocx } = await import('../core/pdfgen/word.ts');
    return (doc, signal) => prepareDocx(doc, job.file, signal);
  }
  const { markdownToHtml, prepareMarkdown } = await import('../core/pdfgen/markdown.ts');
  return async (doc) => {
    const html = await markdownToHtml(await job.file.text());
    return prepareMarkdown(doc, html, job.assets, job.options);
  };
}

/**
 * Word / Markdown 转 PDF 的队列。排版要用 DOM，只能在主线程串行跑；
 * 一次一个文件，跑的时候界面仍然可用（排版本身不长）。
 */
export function useToPdfQueue() {
  const [jobs, setJobs] = useState<DocJob[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const chain = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((id: string, updater: (job: DocJob) => DocJob): void => {
    setJobs((prev) => prev.map((job) => (job.id === id ? updater(job) : job)));
  }, []);

  const run = useCallback(
    (job: DocJob): void => {
      const controller = new AbortController();
      controllers.current.set(job.id, controller);
      chain.current = chain.current.then(async () => {
        if (controller.signal.aborted) {
          patch(job.id, (j) => ({ ...j, status: 'cancelled', finishedAt: Date.now() }));
          return;
        }
        patch(job.id, (j) => ({
          ...j,
          status: 'running',
          stage: 'render',
          fraction: 0.02,
          startedAt: Date.now(),
        }));
        try {
          const [{ htmlToPdf }, producer] = await Promise.all([
            import('../core/pdfgen/html-to-pdf.ts'),
            producerFor(job),
          ]);
          const result = await htmlToPdf(
            producer,
            { cjk: job.options.cjk, title: safeBaseName(job.file.name) },
            {
              signal: controller.signal,
              onProgress: (stage, done, total) => {
                const [from, to] = STAGE_BASE[stage];
                const fraction = from + ((to - from) * done) / Math.max(1, total);
                patch(job.id, (j) => ({ ...j, stage, fraction }));
              },
            },
          );
          const blob = new Blob([result.bytes as BlobPart], { type: 'application/pdf' });
          patch(job.id, (j) => ({
            ...j,
            status: 'done',
            fraction: 1,
            finishedAt: Date.now(),
            result: {
              url: URL.createObjectURL(blob),
              fileName: `${safeBaseName(job.file.name)}.pdf`,
              size: blob.size,
              pages: result.pages,
              imagesSkipped: result.imagesSkipped,
            },
          }));
        } catch (error) {
          const aborted =
            controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
          patch(job.id, (j) => ({
            ...j,
            status: aborted ? 'cancelled' : 'error',
            finishedAt: Date.now(),
            error: aborted ? undefined : error instanceof Error ? error.message : String(error),
          }));
        } finally {
          controllers.current.delete(job.id);
        }
      });
    },
    [patch],
  );

  const enqueue = useCallback(
    (
      source: DocSource,
      files: readonly File[],
      assets: ReadonlyMap<string, Blob>,
      options: DocPdfOptions,
    ): void => {
      const created: DocJob[] = files.map((file) => ({
        id: nextId(),
        source,
        file,
        assets,
        options,
        status: 'queued',
        fraction: 0,
      }));
      setJobs((prev) => [...created, ...prev]);
      for (const job of created) run(job);
    },
    [run],
  );

  const cancel = useCallback((id: string): void => {
    controllers.current.get(id)?.abort();
  }, []);

  const retry = useCallback(
    (id: string, options?: DocPdfOptions): void => {
      setJobs((prev) => {
        const job = prev.find((j) => j.id === id);
        if (job === undefined) return prev;
        if (job.result !== undefined) URL.revokeObjectURL(job.result.url);
        const fresh: DocJob = {
          ...job,
          options: options ?? job.options,
          status: 'queued',
          stage: undefined,
          fraction: 0,
          startedAt: undefined,
          finishedAt: undefined,
          result: undefined,
          error: undefined,
        };
        run(fresh);
        return prev.map((j) => (j.id === id ? fresh : j));
      });
    },
    [run],
  );

  const remove = useCallback((id: string): void => {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === id);
      if (job?.result !== undefined) URL.revokeObjectURL(job.result.url);
      return prev.filter((j) => j.id !== id);
    });
  }, []);

  const clearFinished = useCallback((source: DocSource): void => {
    setJobs((prev) => {
      for (const job of prev) {
        if (job.source === source && job.result !== undefined && job.status !== 'running') {
          URL.revokeObjectURL(job.result.url);
        }
      }
      return prev.filter(
        (j) => j.source !== source || j.status === 'running' || j.status === 'queued',
      );
    });
  }, []);

  useEffect(() => {
    const map = controllers.current;
    return () => {
      for (const c of map.values()) c.abort();
    };
  }, []);

  return { jobs, enqueue, cancel, retry, remove, clearFinished };
}
