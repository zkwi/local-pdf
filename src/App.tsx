import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { acceptsFile, routeTool, TOOLS } from './ui/tools.ts';
import type { ToolActivity, ToolId } from './ui/tools.ts';
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

interface Pending {
  readonly files: readonly File[];
  readonly text?: string;
}

/**
 * 页面外壳：顶栏、工具导航、当前工具的标题和面板、卖点和说明。
 * 六个工具页全部挂着、只显示当前这个，切换工具不丢队列和已选的图片。
 */
export function App() {
  const { t, locale } = useI18n();
  const caps = useMemo(() => probeCapabilities(), []);
  const [tool, navigate] = useTool();
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [imageActivity, setImageActivity] = useState<ToolActivity>({ count: 0, busy: false });
  /** 后台标签页里转完了：标题挂个 ✅，切回来就摘掉 */
  const [attention, setAttention] = useState(false);
  const sinkRef = useRef<FileSink | null>(null);
  /** 切换工具后要交给新工具的文件：新工具注册接收器时送过去 */
  const pendingRef = useRef<Pending | null>(null);
  const pdfQueue = useConversionQueue();
  const docQueue = useToPdfQueue();
  const ocrAvailable = caps.wasmSimd;

  const shell = useMemo<Shell>(
    () => ({
      setSink: (sink) => {
        sinkRef.current = sink;
        const pending = pendingRef.current;
        if (sink !== null && pending !== null) {
          pendingRef.current = null;
          sink(pending.files, pending.text);
        }
      },
      toast: (message) => setToast(message),
    }),
    [],
  );

  const toolTitle = t(`tool.${tool.id}.title` as MessageKey);
  /** 标签页标题和 og:title 共用的基础标题 */
  const baseTitle =
    tool.id === 'pdf-to-word' ? t('app.docTitle') : t('tool.docTitle', { tool: toolTitle });

  /**
   * 文件先问当前工具收不收；一个都收不下的话，找能收的工具切过去再交给它。
   * 在 PDF 转 Word 页丢进一份 .docx，就直接跳到 Word 转 PDF 开始转，而不是只说"已忽略"。
   */
  const deliver = useCallback(
    (files: readonly File[], text?: string): boolean => {
      if (files.length > 0 && !files.some((file) => acceptsFile(tool, file))) {
        const target = routeTool(files);
        if (target !== null && target.id !== tool.id) {
          pendingRef.current = { files, text };
          navigate(target);
          setToast(t('drop.switched', { tool: t(`tool.${target.id}.title` as MessageKey) }));
          return true;
        }
      }
      return sinkRef.current?.(files, text) ?? false;
    },
    [navigate, t, tool],
  );
  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;

  const pdfJobs = pdfQueue.jobs;
  const pdfSettled = pdfJobs.filter((j) => j.status !== 'running' && j.status !== 'queued').length;
  const docJobs = docQueue.jobs;
  const docSettled = docJobs.filter((j) => j.status !== 'running' && j.status !== 'queued').length;
  const busy = pdfSettled < pdfJobs.length || docSettled < docJobs.length || imageActivity.busy;
  const toolActivity = useMemo<Record<ToolId, ToolActivity>>(() => {
    const summarize = (jobs: readonly { readonly status: string }[]): ToolActivity => ({
      count: jobs.length,
      busy: jobs.some((job) => job.status === 'running' || job.status === 'queued'),
    });
    return {
      'pdf-to-word': summarize(
        pdfJobs.filter((job) => job.options.output === 'docx' || job.options.output === 'both'),
      ),
      'pdf-to-markdown': summarize(
        pdfJobs.filter((job) => job.options.output === 'markdown' || job.options.output === 'both'),
      ),
      'pdf-to-images': summarize(pdfJobs.filter((job) => job.options.output === 'images')),
      'word-to-pdf': summarize(docJobs.filter((job) => job.source === 'word')),
      'markdown-to-pdf': summarize(docJobs.filter((job) => job.source === 'markdown')),
      'images-to-pdf': imageActivity,
    };
  }, [docJobs, imageActivity, pdfJobs]);

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
      deliverRef.current([...(e.dataTransfer?.files ?? [])]);
    };
    const onPaste = (e: ClipboardEvent): void => {
      if (isEditable(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      const text = files.length === 0 ? e.clipboardData?.getData('text/plain') : undefined;
      if (files.length === 0 && (text === undefined || text === '')) return;
      if (deliverRef.current(files, text)) e.preventDefault();
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

  // 用户切去别的标签页时转完的，标题挂上 ✅，回到本页（或又开始新任务）就摘掉
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) setAttention(false);
    else if (wasBusy.current && document.visibilityState === 'hidden') setAttention(true);
    wasBusy.current = busy;
  }, [busy]);
  useEffect(() => {
    if (!attention) return;
    const seen = (): void => {
      if (document.visibilityState === 'visible') setAttention(false);
    };
    document.addEventListener('visibilitychange', seen);
    window.addEventListener('focus', seen);
    return () => {
      document.removeEventListener('visibilitychange', seen);
      window.removeEventListener('focus', seen);
    };
  }, [attention]);

  // 标签页标题跟着工具走；转换中带进度，关页面前拦一下
  useEffect(() => {
    const base = baseTitle;
    const total = pdfJobs.length + docJobs.length;
    const settled = pdfSettled + docSettled;
    if (busy && total > 0) document.title = `⏳ ${settled}/${total} · ${base}`;
    else if (busy) document.title = `⏳ ${base}`;
    else if (attention) document.title = `${t('app.titleDone')} · ${base}`;
    else document.title = base;
  }, [attention, busy, docJobs.length, docSettled, pdfJobs.length, pdfSettled, baseTitle, t]);

  // history.pushState 不会触发语言 Provider 的 effect：canonical、hreflang、描述和 Open Graph
  // 都要跟着当前工具和语言主动同步，搜索引擎渲染 ?lang= 版本时拿到的才是对应语言的描述。
  useEffect(() => {
    const page = new URL(location.pathname, location.origin);
    const canonical = new URL(page);
    if (new URLSearchParams(location.search).get('lang') === locale) {
      canonical.searchParams.set('lang', locale);
    }
    const description =
      tool.id === 'pdf-to-word'
        ? t('meta.description')
        : `${t(`tool.${tool.id}.lede` as MessageKey)} ${t('meta.suffix')}`;
    const head = document.head;
    const set = (selector: string, attribute: string, value: string): void => {
      head.querySelector(selector)?.setAttribute(attribute, value);
    };
    set('link[rel="canonical"]', 'href', canonical.href);
    set('meta[name="description"]', 'content', description);
    set('meta[property="og:title"]', 'content', baseTitle);
    set('meta[property="og:description"]', 'content', description);
    set('meta[property="og:url"]', 'content', canonical.href);
    // hreflang：路径换成当前工具，各语言保留自己的 ?lang=
    for (const link of head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')) {
      const lang = new URL(link.href).searchParams.get('lang');
      const url = new URL(page);
      if (lang !== null) url.searchParams.set('lang', lang);
      link.href = url.href;
    }
  }, [baseTitle, locale, t, tool.id]);

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
          <a className="skip-link" href="#main">
            {t('app.skip')}
          </a>
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
            <ToolNav active={tool} activity={toolActivity} onSelect={navigate} />
          </div>

          <main className="main" id="main" tabIndex={-1}>
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
                      <ImagesToPdfTool tool={each} active={active} onActivity={setImageActivity} />
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
              <a href={SITE.changelog} target="_blank" rel="noopener noreferrer">
                {t('footer.version', { version: SITE.version })}
              </a>
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
