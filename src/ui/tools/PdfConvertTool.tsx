import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_OPTIONS } from '../../core/contracts/options.ts';
import type {
  ConversionMode,
  ConvertOptions,
  OcrLanguage,
  OcrPolicy,
  OcrQuality,
  PageImageFormat,
} from '../../core/contracts/options.ts';
import { OCR_LANGUAGES } from '../../core/ocr/languages.ts';
import type { useConversionQueue } from '../../hooks/useConversionQueue.ts';
import { useI18n } from '../../i18n/index.tsx';
import type { MessageKey } from '../../i18n/index.tsx';
import { SITE } from '../../site.ts';
import { DropZone, splitPdfs } from '../DropZone.tsx';
import { JobCard } from '../JobCard.tsx';
import { OptionsPanel } from '../OptionsPanel.tsx';
import { PanelMore } from '../PanelMore.tsx';
import { useStored } from '../persist.ts';
import { useFileSink, useShell } from '../shell.tsx';
import type { Tool } from '../tools.ts';
import { downloadAsZip } from '../zip.ts';

type Queue = ReturnType<typeof useConversionQueue>;

interface PdfConvertToolProps {
  readonly tool: Tool;
  readonly active: boolean;
  /** 三个"从 PDF 转出"的页面共用一条 Worker 队列，各自只显示自己那种输出的任务 */
  readonly queue: Queue;
  readonly ocrAvailable: boolean;
}

const STORAGE_KEY = 'local-pdf.convert';
/** 由页面或运行环境决定、不该跨会话记住的键 */
const UNSTORED: readonly (keyof ConvertOptions)[] = [
  'output',
  'locale',
  'password',
  'renderScale',
  'maxPages',
  'detectBorderlessTables',
];

const oneOf = <T extends string | number>(list: readonly T[], value: T, fallback: T): T =>
  list.includes(value) ? value : fallback;

/** 存储里的枚举值过期了就退回默认，别让一个旧值把转换搞坏 */
function fixOptions(o: ConvertOptions): ConvertOptions {
  return {
    ...o,
    mode: oneOf<ConversionMode>(['editable', 'plain-text'], o.mode, DEFAULT_OPTIONS.mode),
    ocr: oneOf<OcrPolicy>(['auto', 'off', 'force'], o.ocr, DEFAULT_OPTIONS.ocr),
    ocrQuality: oneOf<OcrQuality>(['fast', 'balanced'], o.ocrQuality, DEFAULT_OPTIONS.ocrQuality),
    ocrLanguage: oneOf<OcrLanguage | 'auto'>(
      ['auto', ...OCR_LANGUAGES.map((l) => l.value)],
      o.ocrLanguage,
      'auto',
    ),
    pageImageFormat: oneOf<PageImageFormat>(
      ['png', 'jpeg'],
      o.pageImageFormat,
      DEFAULT_OPTIONS.pageImageFormat,
    ),
    pageImageDpi: oneOf([96, 150, 300], o.pageImageDpi, DEFAULT_OPTIONS.pageImageDpi),
  };
}

/** PDF → Word / Markdown / 图片：输出格式由页面决定，其余设置在"更多选项"里，改过的会记住 */
export function PdfConvertTool({ tool, active, queue, ocrAvailable }: PdfConvertToolProps) {
  const { t, tn, locale } = useI18n();
  const { toast } = useShell();
  const output = tool.output ?? 'docx';
  const [options, setOptions] = useStored<ConvertOptions>(
    STORAGE_KEY,
    { ...DEFAULT_OPTIONS, output },
    { omit: UNSTORED, fix: fixOptions },
  );
  const [also, setAlso] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const queueRef = useRef<HTMLDivElement>(null);
  const advancedId = `${tool.id}-advanced-panel`;

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

  // 逐个触发下载会被浏览器拦成"允许多个下载？"，打成一个 zip 只下载一次
  const downloadAll = useCallback(async () => {
    if (zipping) return;
    const entries = finished.flatMap((job) =>
      (job.result?.outputs ?? []).map((o) => ({ name: o.fileName, blob: o.blob })),
    );
    if (entries.length === 0) return;
    setZipping(true);
    try {
      await downloadAsZip(entries, `${tool.id}.zip`);
    } catch {
      toast(t('queue.zipFailed'));
    } finally {
      setZipping(false);
    }
  }, [finished, t, toast, tool.id, zipping]);

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
                  <button
                    className="btn btn--ghost"
                    type="button"
                    disabled={zipping}
                    onClick={() => void downloadAll()}
                  >
                    {zipping
                      ? t('queue.zipping')
                      : t('queue.downloadAll', { count: finished.length })}
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
          controls={advancedId}
          onToggle={() => setAdvancedOpen((v) => !v)}
        />
      </div>

      {advancedOpen && (
        <OptionsPanel
          id={advancedId}
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
