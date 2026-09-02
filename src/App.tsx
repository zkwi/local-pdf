import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_OPTIONS } from './core/contracts/options.ts';
import type { ConvertOptions, OutputFormat } from './core/contracts/options.ts';
import { useConversionQueue } from './hooks/useConversionQueue.ts';
import { useI18n } from './i18n/index.tsx';
import type { MessageKey } from './i18n/index.tsx';
import { probeCapabilities } from './ui/capabilities.ts';
import { CompatGate } from './ui/CompatGate.tsx';
import { DropZone, splitPdfs } from './ui/DropZone.tsx';
import { JobCard } from './ui/JobCard.tsx';
import { LanguageSelect } from './ui/LanguageSelect.tsx';
import { Logo } from './ui/Logo.tsx';
import { OptionsPanel } from './ui/OptionsPanel.tsx';

const OUTPUTS: readonly OutputFormat[] = ['docx', 'markdown', 'both'];
const TOAST_MS = 4000;

export function App() {
  const { t, tn, locale } = useI18n();
  const caps = useMemo(() => probeCapabilities(), []);
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const queueRef = useRef<HTMLElement>(null);
  const { jobs, enqueue, cancel, retry, remove, clearFinished } = useConversionQueue();
  const ocrAvailable = caps.wasmSimd;

  /** 界面语言和能力限制在提交时合并进去，用户设置本身不被改写 */
  const effective = useCallback(
    (base: ConvertOptions): ConvertOptions => ({
      ...base,
      locale,
      ocr: ocrAvailable ? base.ocr : 'off',
    }),
    [locale, ocrAvailable],
  );

  const handleFiles = useCallback(
    (files: readonly File[]) => {
      const { pdfs, rejected } = splitPdfs(files);
      if (rejected > 0) setToast(tn('drop.rejected', rejected));
      if (pdfs.length > 0) enqueue(pdfs, effective(options));
    },
    [effective, enqueue, options, tn],
  );

  const handleRetry = useCallback(
    (id: string, password?: string) => {
      retry(id, effective(password === undefined ? options : { ...options, password }));
    },
    [effective, options, retry],
  );

  const finished = useMemo(() => jobs.filter((job) => job.status === 'done'), [jobs]);
  const settled = jobs.filter((job) => job.status !== 'running' && job.status !== 'queued').length;
  const busy = settled < jobs.length;

  // 整页都是投放区：拖着文件进来时盖一层全屏提示，松手就开始
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      handleFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  // 提示条几秒后自己消失
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // 转换中：标签页标题带进度，关页面前拦一下
  useEffect(() => {
    const base = t('app.docTitle');
    document.title = busy ? `⏳ ${settled}/${jobs.length} · ${base}` : base;
  }, [busy, settled, jobs.length, t]);

  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [busy]);

  // 新任务加进来时把队列滚进视野，小屏上它在拖放区下面看不见
  const prevCount = useRef(0);
  useEffect(() => {
    if (jobs.length > prevCount.current) {
      queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCount.current = jobs.length;
  }, [jobs.length]);

  const downloadAll = useCallback(() => {
    for (const job of finished) {
      for (const output of job.result?.outputs ?? []) {
        const link = document.createElement('a');
        link.href = output.url;
        link.download = output.fileName;
        document.body.append(link);
        link.click();
        link.remove();
      }
    }
  }, [finished]);

  return (
    <CompatGate caps={caps}>
      <div className="app">
        <header className="masthead">
          <div className="masthead__brand">
            <Logo />
            <div>
              <h1>
                {t('app.title')}
                <span className="masthead__feature">{t('app.feature')}</span>
              </h1>
              <p>{t('app.tagline')}</p>
            </div>
          </div>
          <div className="masthead__actions">
            <LanguageSelect />
            <span className="badge" title={t('app.badgeLocalTitle')}>
              {t('app.badgeLocal')}
            </span>
          </div>
        </header>

        <main className="main">
          {!ocrAvailable && <p className="banner banner--warn">{t('ocr.unavailable')}</p>}
          {caps.lowMemory && <p className="banner">{t('compat.lowMemory')}</p>}

          <DropZone onFiles={handleFiles} />

          <section className="output" aria-label={t('output.label')}>
            <span className="output__label">{t('output.label')}</span>
            <div className="segmented segmented--large" role="radiogroup">
              {OUTPUTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={options.output === value}
                  className={`segmented__item${options.output === value ? ' segmented__item--on' : ''}`}
                  onClick={() => setOptions((o) => ({ ...o, output: value }))}
                >
                  {t(`output.${value}` as MessageKey)}
                </button>
              ))}
            </div>
            <p className="output__hint">{t(`output.${options.output}.hint` as MessageKey)}</p>
          </section>

          <OptionsPanel options={options} onChange={setOptions} ocrAvailable={ocrAvailable} />

          {jobs.length > 0 && (
            <section className="queue" ref={queueRef}>
              <div className="queue__head">
                <h2>{t('queue.title', { count: jobs.length })}</h2>
                <div className="queue__actions">
                  {finished.length > 1 && (
                    <button className="btn btn--ghost" type="button" onClick={downloadAll}>
                      {t('queue.downloadAll', { count: finished.length })}
                    </button>
                  )}
                  {!busy && (
                    <button className="btn btn--ghost" type="button" onClick={clearFinished}>
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
                    onCancel={cancel}
                    onRetry={handleRetry}
                    onRemove={remove}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="notes">
            <h2>{t('notes.title')}</h2>
            <ul>
              <li>{t('notes.privacy')}</li>
              <li>{t('notes.ocr')}</li>
              <li>{t('notes.report')}</li>
              <li>{t('notes.limits')}</li>
            </ul>
          </section>
        </main>

        <footer className="footer">
          <span>{t('footer.license')}</span>
          <span>{t('footer.hint')}</span>
        </footer>

        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-overlay__box">{t('drop.overlay')}</div>
          </div>
        )}
        {toast !== null && (
          <div className="toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </div>
    </CompatGate>
  );
}
