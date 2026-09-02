import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_OPTIONS } from '../../core/contracts/options.ts';
import type { ConvertOptions } from '../../core/contracts/options.ts';
import type { useConversionQueue } from '../../hooks/useConversionQueue.ts';
import { useI18n } from '../../i18n/index.tsx';
import type { MessageKey } from '../../i18n/index.tsx';
import { SITE } from '../../site.ts';
import { DropZone, splitPdfs } from '../DropZone.tsx';
import { JobCard } from '../JobCard.tsx';
import { OptionsPanel } from '../OptionsPanel.tsx';
import { PanelMore } from '../PanelMore.tsx';
import { useFileSink, useShell } from '../shell.tsx';
import type { Tool } from '../tools.ts';

type Queue = ReturnType<typeof useConversionQueue>;

interface PdfConvertToolProps {
  readonly tool: Tool;
  readonly active: boolean;
  /** 三个"从 PDF 转出"的页面共用一条 Worker 队列，各自只显示自己那种输出的任务 */
  readonly queue: Queue;
  readonly ocrAvailable: boolean;
}

/** PDF → Word / Markdown / 图片：输出格式由页面决定，其余设置在"更多选项"里 */
export function PdfConvertTool({ tool, active, queue, ocrAvailable }: PdfConvertToolProps) {
  const { t, tn, locale } = useI18n();
  const { toast } = useShell();
  const output = tool.output ?? 'docx';
  const [options, setOptions] = useState<ConvertOptions>(() => ({ ...DEFAULT_OPTIONS, output }));
  const [also, setAlso] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const queueRef = useRef<HTMLDivElement>(null);

  const jobs = useMemo(
    () =>
      queue.jobs.filter(
        (job) =>
          job.options.output === output || (output !== 'images' && job.options.output === 'both'),
      ),
    [queue.jobs, output],
  );

  const settingsChanged = useMemo(
    () =>
      also ||
      JSON.stringify({ ...options, output: DEFAULT_OPTIONS.output }) !==
        JSON.stringify(DEFAULT_OPTIONS),
    [also, options],
  );

  /** 界面语言、能力限制和"顺便也要另一种"在提交时合并进去，用户设置本身不被改写 */
  const effective = useCallback(
    (base: ConvertOptions): ConvertOptions => ({
      ...base,
      output: also && output !== 'images' ? 'both' : output,
      locale,
      ocr: ocrAvailable ? base.ocr : 'off',
    }),
    [also, locale, ocrAvailable, output],
  );

  const handleFiles = useCallback(
    (files: readonly File[]): boolean => {
      const { pdfs, rejected } = splitPdfs(files);
      if (rejected > 0) toast(tn('drop.rejected', rejected));
      if (pdfs.length > 0) queue.enqueue(pdfs, effective(options));
      return files.length > 0;
    },
    [effective, options, queue, tn, toast],
  );
  useFileSink(active, handleFiles);

  const handleRetry = useCallback(
    (id: string, patch?: Partial<ConvertOptions>) => {
      queue.retry(id, effective({ ...options, ...patch }));
    },
    [effective, options, queue],
  );

  /** 没有文件的访客点一下就能看到效果 */
  const loadSample = useCallback(async () => {
    if (sampleLoading) return;
    setSampleLoading(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${SITE.samplePath}`);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      handleFiles([new File([blob], 'local-pdf-sample.pdf', { type: 'application/pdf' })]);
    } catch {
      toast(t('drop.sampleFailed'));
    } finally {
      setSampleLoading(false);
    }
  }, [handleFiles, sampleLoading, t, toast]);

  const finished = useMemo(() => jobs.filter((job) => job.status === 'done'), [jobs]);
  const busy = jobs.some((job) => job.status === 'running' || job.status === 'queued');

  // 新任务加进来时把队列滚进视野，小屏上它在拖放区下面看不见
  const prevCount = useRef(0);
  useEffect(() => {
    if (jobs.length > prevCount.current && active) {
      queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCount.current = jobs.length;
  }, [active, jobs.length]);

  const downloadAll = useCallback(() => {
    for (const job of finished) {
      for (const out of job.result?.outputs ?? []) {
        const link = document.createElement('a');
        link.href = out.url;
        link.download = out.fileName;
        document.body.append(link);
        link.click();
        link.remove();
      }
    }
  }, [finished]);

  return (
    <div className="panel">
      <div className="panel__body" ref={queueRef}>
        {jobs.length === 0 ? (
          <DropZone onFiles={handleFiles} onSample={loadSample} accept={tool.accept} />
        ) : (
          <>
            <div className="queue__head">
              <h2>{t('queue.title', { count: jobs.length })}</h2>
              <div className="queue__actions">
                {finished.length > 1 && (
                  <button className="btn btn--ghost" type="button" onClick={downloadAll}>
                    {t('queue.downloadAll', { count: finished.length })}
                  </button>
                )}
                {!busy && (
                  <button className="btn btn--ghost" type="button" onClick={queue.clearFinished}>
                    {t('queue.clear')}
                  </button>
                )}
              </div>
            </div>
            <div className="queue__list">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onCancel={queue.cancel}
                  onRetry={handleRetry}
                  onRemove={queue.remove}
                />
              ))}
            </div>
            <DropZone onFiles={handleFiles} compact accept={tool.accept} />
          </>
        )}
      </div>

      <div className="panel__bar panel__bar--solo">
        <p className="panel__lead">{t(`output.${output}.hint` as MessageKey)}</p>
        <PanelMore
          open={advancedOpen}
          changed={settingsChanged}
          onToggle={() => setAdvancedOpen((v) => !v)}
        />
      </div>

      {advancedOpen && (
        <OptionsPanel
          options={options}
          onChange={setOptions}
          ocrAvailable={ocrAvailable}
          also={also}
          onAlsoChange={setAlso}
        />
      )}
    </div>
  );
}
