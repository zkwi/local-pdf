import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useConversionQueue } from './hooks/useConversionQueue.ts';
import { useToPdfQueue } from './hooks/useToPdfQueue.ts';
import { useI18n } from './i18n/index.tsx';
import type { MessageKey } from './i18n/index.tsx';
import { SITE } from './site.ts';
import { probeCapabilities } from './ui/capabilities.ts';
import { CompatGate } from './ui/CompatGate.tsx';
import { Features } from './ui/Features.tsx';
import { LanguageSelect } from './ui/LanguageSelect.tsx';
import { Logo } from './ui/Logo.tsx';
import { useTool } from './ui/router.ts';
import { SeoContent } from './ui/SeoContent.tsx';
import { ShellContext } from './ui/shell.tsx';
import type { FileSink, Shell } from './ui/shell.tsx';
import { ToolNav } from './ui/ToolNav.tsx';
import { TOOLS } from './ui/tools.ts';
import { DocToPdfTool } from './ui/tools/DocToPdfTool.tsx';
import { ImagesToPdfTool } from './ui/tools/ImagesToPdfTool.tsx';
import { PdfConvertTool } from './ui/tools/PdfConvertTool.tsx';

const TOAST_MS = 4000;

/** 首屏各区块按这个序号错开入场（见 styles.css 的 .reveal） */
const reveal = (index: number): CSSProperties => ({ '--i': index }) as CSSProperties;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/**
 * 页面外壳：顶栏、工具导航、当前工具的标题和面板、卖点和说明。
 * 六个工具页全部挂着、只显示当前这个，切换工具不丢队列和已选的图片。
 */
export function App() {
  const { t } = useI18n();
  const caps = useMemo(() => probeCapabilities(), []);
  const [tool, navigate] = useTool();
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [imagesBusy, setImagesBusy] = useState(false);
  const sinkRef = useRef<FileSink | null>(null);
  const pdfQueue = useConversionQueue();
  const docQueue = useToPdfQueue();
  const ocrAvailable = caps.wasmSimd;

  const shell = useMemo<Shell>(
    () => ({
      setSink: (sink) => {
        sinkRef.current = sink;
      },
      toast: (message) => setToast(message),
    }),
    [],
  );

  const pdfJobs = pdfQueue.jobs;
  const pdfSettled = pdfJobs.filter((j) => j.status !== 'running' && j.status !== 'queued').length;
  const docJobs = docQueue.jobs;
  const docSettled = docJobs.filter((j) => j.status !== 'running' && j.status !== 'queued').length;
  const busy = pdfSettled < pdfJobs.length || docSettled < docJobs.length || imagesBusy;

  // 页面空闲时先把转换 Worker（含 pdf.js，约 2 MB）拉起来，第一次转换不用等下载
  const { warmUp } = pdfQueue;
  useEffect(() => {
    if (tool.group !== 'from-pdf') return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => warmUp());
      return;
    }
    const timer = setTimeout(() => warmUp(), 1500);
    return () => clearTimeout(timer);
  }, [tool.group, warmUp]);

  // 整页都是投放区：拖着文件进来时盖一层全屏提示，松手交给当前工具；Ctrl+V 粘贴同样接住
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
      sinkRef.current?.([...(e.dataTransfer?.files ?? [])]);
    };
    const onPaste = (e: ClipboardEvent): void => {
      if (isEditable(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      const text = files.length === 0 ? e.clipboardData?.getData('text/plain') : undefined;
      if (files.length === 0 && (text === undefined || text === '')) return;
      if (sinkRef.current?.(files, text) === true) e.preventDefault();
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
  }, []);

  // 提示条几秒后自己消失
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // 标签页标题跟着工具走；转换中带进度，关页面前拦一下
  const toolTitle = t(`tool.${tool.id}.title` as MessageKey);
  useEffect(() => {
    const base =
      tool.id === 'pdf-to-word' ? t('app.docTitle') : t('tool.docTitle', { tool: toolTitle });
    const total = pdfJobs.length + docJobs.length;
    const settled = pdfSettled + docSettled;
    document.title =
      busy && total > 0 ? `⏳ ${settled}/${total} · ${base}` : busy ? `⏳ ${base}` : base;
  }, [busy, docJobs.length, docSettled, pdfJobs.length, pdfSettled, t, tool.id, toolTitle]);

  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [busy]);

  return (
    <CompatGate caps={caps}>
      <ShellContext.Provider value={shell}>
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

          <div className="reveal" style={reveal(1)}>
            <ToolNav active={tool} onSelect={navigate} />
          </div>

          <main className="main">
            {!ocrAvailable && tool.group === 'from-pdf' && (
              <p className="banner banner--warn">{t('ocr.unavailable')}</p>
            )}
            {caps.lowMemory && <p className="banner">{t('compat.lowMemory')}</p>}

            <section className="hero reveal" style={reveal(1)} aria-labelledby="hero-title">
              <h1 id="hero-title" className="hero__title" key={`title-${tool.id}`}>
                {toolTitle}
              </h1>
              <p className="hero__lede" key={`lede-${tool.id}`}>
                {t(`tool.${tool.id}.lede` as MessageKey)}
              </p>

              {TOOLS.map((each) => {
                const active = each.id === tool.id;
                return (
                  <div key={each.id} className="tool" hidden={!active}>
                    {each.group === 'from-pdf' && (
                      <PdfConvertTool
                        tool={each}
                        active={active}
                        queue={pdfQueue}
                        ocrAvailable={ocrAvailable}
                      />
                    )}
                    {(each.id === 'word-to-pdf' || each.id === 'markdown-to-pdf') && (
                      <DocToPdfTool
                        tool={each}
                        source={each.id === 'word-to-pdf' ? 'word' : 'markdown'}
                        active={active}
                        queue={docQueue}
                      />
                    )}
                    {each.id === 'images-to-pdf' && (
                      <ImagesToPdfTool tool={each} active={active} onBusy={setImagesBusy} />
                    )}
                  </div>
                );
              })}
            </section>

            <Features group={tool.group} />

            <SeoContent group={tool.group} />
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
              <div className="drop-overlay__box">
                {t(tool.id === 'images-to-pdf' ? 'drop.overlay.images' : 'drop.overlay')}
              </div>
            </div>
          )}
          {toast !== null && (
            <div className="toast" role="status" aria-live="polite">
              {toast}
            </div>
          )}
        </div>
      </ShellContext.Provider>
    </CompatGate>
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
