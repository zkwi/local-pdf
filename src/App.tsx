import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DEFAULT_OPTIONS } from './core/contracts/options.ts';
import type { ConvertOptions, OutputFormat } from './core/contracts/options.ts';
import { useConversionQueue } from './hooks/useConversionQueue.ts';
import { useI18n } from './i18n/index.tsx';
import type { MessageKey } from './i18n/index.tsx';
import { SITE } from './site.ts';
import { probeCapabilities } from './ui/capabilities.ts';
import { CompatGate } from './ui/CompatGate.tsx';
import { DropZone, splitPdfs } from './ui/DropZone.tsx';
import { Features } from './ui/Features.tsx';
import { JobCard } from './ui/JobCard.tsx';
import { LanguageSelect } from './ui/LanguageSelect.tsx';
import { Logo } from './ui/Logo.tsx';
import { OptionsPanel } from './ui/OptionsPanel.tsx';
import { SeoContent } from './ui/SeoContent.tsx';

const OUTPUTS: readonly OutputFormat[] = ['docx', 'markdown', 'both'];
const TOAST_MS = 4000;

/** 首屏各区块按这个序号错开入场（见 styles.css 的 .reveal） */
const reveal = (index: number): CSSProperties => ({ '--i': index }) as CSSProperties;

export function App() {
  const { t, tn, locale } = useI18n();
  const caps = useMemo(() => probeCapabilities(), []);
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const queueRef = useRef<HTMLDivElement>(null);
  const { jobs, enqueue, cancel, retry, remove, clearFinished, warmUp } = useConversionQueue();
  const ocrAvailable = caps.wasmSimd;

  // 输出格式之外还改过设置时，"更多选项"按钮上亮一个点，收起也看得见
  const settingsChanged = useMemo(
    () =>
      JSON.stringify({ ...options, output: DEFAULT_OPTIONS.output }) !==
      JSON.stringify(DEFAULT_OPTIONS),
    [options],
  );

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
    (id: string, patch?: Partial<ConvertOptions>) => {
      retry(id, effective({ ...options, ...patch }));
    },
    [effective, options, retry],
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
      setToast(t('drop.sampleFailed'));
    } finally {
      setSampleLoading(false);
    }
  }, [handleFiles, sampleLoading, t]);

  const finished = useMemo(() => jobs.filter((job) => job.status === 'done'), [jobs]);
  const settled = jobs.filter((job) => job.status !== 'running' && job.status !== 'queued').length;
  const busy = settled < jobs.length;

  // 页面空闲时先把转换 Worker（含 pdf.js，约 2 MB）拉起来，第一次转换不用等下载
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => warmUp());
      return;
    }
    const timer = setTimeout(() => warmUp(), 1500);
    return () => clearTimeout(timer);
  }, [warmUp]);

  // 整页都是投放区：拖着文件进来时盖一层全屏提示，松手就开始；Ctrl+V 粘贴文件同样接住
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
    const onPaste = (e: ClipboardEvent): void => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      handleFiles(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
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
      <div className="app" data-dragging={dragging || undefined}>
        <header className="masthead reveal" style={reveal(0)}>
          <div className="masthead__brand">
            <Logo size={36} />
            <span className="masthead__name">{t('app.title')}</span>
          </div>
          <div className="masthead__actions">
            <LanguageSelect />
            <a
              className="ghlink"
              href={SITE.repo}
              target="_blank"
              rel="noopener noreferrer"
              title={t('app.github')}
            >
              <GitHubIcon />
              <span>GitHub</span>
            </a>
            <span className="badge" title={t('app.badgeLocalTitle')}>
              {t('app.badgeLocal')}
            </span>
          </div>
        </header>

        <main className="main">
          {!ocrAvailable && <p className="banner banner--warn">{t('ocr.unavailable')}</p>}
          {caps.lowMemory && <p className="banner">{t('compat.lowMemory')}</p>}

          <section className="hero reveal" style={reveal(1)} aria-labelledby="hero-title">
            <h1 id="hero-title" className="hero__title">
              {t('app.feature')}
            </h1>
            <p className="hero__lede">{t('app.tagline')}</p>

            {/* 主面板：顶栏是设置，中间按有没有任务切换拖放区 / 队列，所有操作不出首屏 */}
            <div className="panel">
              <div className="panel__bar">
                <div className="panel__output">
                  <span className="eyebrow">{t('output.label')}</span>
                  <div
                    className="segmented segmented--large"
                    role="radiogroup"
                    aria-label={t('output.label')}
                    // 滑块位置交给 CSS 算：改哪个选中就把序号写进变量
                    style={
                      {
                        '--count': OUTPUTS.length,
                        '--index': OUTPUTS.indexOf(options.output),
                      } as CSSProperties
                    }
                  >
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
                </div>
                <button
                  type="button"
                  className={`panel__more${advancedOpen ? ' panel__more--open' : ''}`}
                  aria-expanded={advancedOpen}
                  aria-controls="advanced-panel"
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  <SlidersIcon />
                  <span>{t('advanced.toggle')}</span>
                  {settingsChanged && <span className="panel__dot" aria-hidden="true" />}
                  <span className="panel__chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </div>
              <p className="panel__hint" key={options.output}>
                {t(`output.${options.output}.hint` as MessageKey)}
              </p>

              {advancedOpen && (
                <OptionsPanel options={options} onChange={setOptions} ocrAvailable={ocrAvailable} />
              )}

              <div className="panel__body" ref={queueRef}>
                {jobs.length === 0 ? (
                  <DropZone onFiles={handleFiles} onSample={loadSample} />
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
                    <DropZone onFiles={handleFiles} compact />
                  </>
                )}
              </div>
            </div>
          </section>

          <Features />

          <SeoContent />
        </main>

        <footer className="footer">
          <div className="footer__links">
            <span>{t('footer.license')}</span>
            <span>{t('footer.version', { version: SITE.version })}</span>
            <a href={SITE.repo} target="_blank" rel="noopener noreferrer">
              {t('footer.source')}
            </a>
            <a href={SITE.issues} target="_blank" rel="noopener noreferrer">
              {t('footer.issues')}
            </a>
          </div>
          <span className="footer__built">{t('footer.builtWith')}</span>
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

function SlidersIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 5h7M14 5h3M3 10h2M9 10h8M3 15h9M16 15h1" />
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="7" cy="10" r="1.8" />
        <circle cx="14" cy="15" r="1.8" />
      </g>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}
