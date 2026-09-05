import { unzipSync } from 'fflate';
import { useEffect, useState } from 'react';
import type { ConvertOptions } from '../core/contracts/options.ts';
import type { ConversionReport, MessageParams } from '../core/contracts/report.ts';
import type { Job, JobOutput } from '../hooks/useConversionQueue.ts';
import { formatPageRange } from '../core/util/page-range.ts';
import { useI18n } from '../i18n/index.tsx';
import type { I18n, MessageKey } from '../i18n/index.tsx';
import { estimateRemainingMs, formatClock } from './eta.ts';
import {
  browserEnvironment,
  feedbackUrl,
  jobDiagnostics,
  pdfToolId,
  reportDiagnostics,
} from './feedback.ts';
import { formatSize } from './format.ts';
import { ReportView } from './ReportView.tsx';
import { useShell } from './shell.tsx';

interface JobCardProps {
  readonly job: Job;
  readonly onCancel: (id: string) => void;
  /** patch 盖在当前设置上：输入密码，或者改成"只要文字"重试 */
  readonly onRetry: (id: string, patch?: Partial<ConvertOptions>) => void;
  readonly onRemove: (id: string) => void;
}

/** 超过这个体积一开始就提示"会比较久"，不等估算出来 */
const LARGE_FILE_BYTES = 100 * 1024 * 1024;
/** 估计剩余时间超过这个值也提示 */
const SLOW_ETA_MS = 90_000;

export function JobCard({ job, onCancel, onRetry, onRemove }: JobCardProps) {
  const { t, tn, locale, stageLabel, progressText, errorText } = useI18n();
  const { toast } = useShell();
  const [password, setPassword] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [slowNoticed, setSlowNoticed] = useState(false);
  const running = job.status === 'running' || job.status === 'queued';
  const needsPassword =
    job.error?.code === 'password-required' || job.error?.code === 'password-incorrect';
  const memoryError = job.error?.code === 'out-of-memory' || job.error?.code === 'worker-crashed';
  const outputSize = job.result?.outputs.reduce((s, o) => s + o.size, 0) ?? 0;
  const statusText = job.error !== undefined ? errorText(job.error) : progressText(job.progress);
  const imagesOnly = job.options.output === 'images';
  const summary =
    job.result === undefined ? null : summarize(job.result.report, job.options, t, tn);
  /** Markdown 结果可以直接复制进编辑器，不必下载再打开；带图片的 zip 包就取里面的 .md */
  const markdownOutput = job.result?.outputs.find(
    (o) => o.kind === 'markdown' || o.kind === 'markdown-bundle',
  );

  const copyMarkdown = async (output: JobOutput): Promise<void> => {
    try {
      let text: string;
      if (output.kind === 'markdown-bundle') {
        const files = unzipSync(new Uint8Array(await output.blob.arrayBuffer()));
        const name = Object.keys(files).find((f) => f.toLowerCase().endsWith('.md'));
        if (name === undefined) throw new Error('no markdown in bundle');
        text = new TextDecoder().decode(files[name]);
      } else {
        text = await output.blob.text();
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast(t('job.copyFailed'));
    }
  };

  // 运行中每秒刷新一次已用时间和剩余估计
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const eta = running ? estimateRemainingMs(job.progress, job.samples, now) : null;
  const slow =
    running && (job.file.size >= LARGE_FILE_BYTES || (eta !== null && eta >= SLOW_ETA_MS));
  // 提示过就一直显示到结束，别随着估计抖动一闪一闪
  useEffect(() => {
    setSlowNoticed((v) => (running ? v || slow : false));
  }, [running, slow]);

  const elapsed =
    job.startedAt === undefined ? null : (running ? now : (job.finishedAt ?? now)) - job.startedAt;
  let timeText: string | null = null;
  if (elapsed !== null && running) timeText = t('job.elapsed', { time: formatClock(elapsed) });
  else if (elapsed !== null && job.status === 'done') {
    timeText = t('job.duration', { time: formatClock(elapsed) });
  }

  const pages = job.progress.totalPages;
  const documentPages = job.progress.documentPages;
  const notices: string[] = [];
  if (running && (slow || slowNoticed)) {
    const size = formatSize(job.file.size);
    notices.push(
      pages !== undefined ? t('job.large.pages', { pages, size }) : t('job.large.size', { size }),
    );
    // 扫描页占了大头才解释"每一页都要识别"；夹着几张图的普通书不算
    const pagesDone = (job.progress.pageIndex ?? 0) + 1;
    if (job.ocrPages >= 3 && job.ocrPages >= pagesDone * 0.3) notices.push(t('job.large.ocr'));
  }
  // 图片模式下 totalPages 是选中的张数；用户自己挑了页码范围就不必再说"只转前几页"
  const ranged = imagesOnly && job.options.pageRange.trim() !== '';
  if (
    running &&
    !ranged &&
    pages !== undefined &&
    documentPages !== undefined &&
    documentPages > pages
  ) {
    notices.push(t('job.pageLimit', { total: documentPages, limit: pages }));
  }
  // 图片模式没有"只要文字"可退：内存不够只能降清晰度或拆文件
  const canRetryPlain =
    !imagesOnly && (job.options.mode !== 'plain-text' || job.options.extractImages);
  /** 反馈链接按输出格式归到对应的工具页 */
  const tool = pdfToolId(job.options.output);

  return (
    <article className={`job job--${job.status}`}>
      <header className="job__head">
        <div className="job__id">
          <span className="job__name" title={job.file.name}>
            {job.file.name}
          </span>
          <span className="job__meta">
            {formatSize(job.file.size)}
            {job.result && ` → ${formatSize(outputSize)}`}
          </span>
        </div>
        <div className="job__actions">
          {running && (
            <button className="btn btn--ghost" type="button" onClick={() => onCancel(job.id)}>
              {t('job.cancel')}
            </button>
          )}
          {job.status === 'done' && markdownOutput !== undefined && (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => void copyMarkdown(markdownOutput)}
            >
              {copied ? t('job.copied') : t('job.copy')}
            </button>
          )}
          {job.status === 'done' &&
            job.result?.outputs.map((output) => (
              <a
                key={output.kind}
                className="btn btn--primary"
                href={output.url}
                download={output.fileName}
                title={`${output.fileName} (${formatSize(output.size)})`}
              >
                {t(`job.download.${output.kind}` as MessageKey)}
              </a>
            ))}
          {(job.status === 'error' || job.status === 'cancelled') && !needsPassword && (
            <button className="btn btn--ghost" type="button" onClick={() => onRetry(job.id)}>
              {t('job.retry')}
            </button>
          )}
          {job.status === 'error' && !needsPassword && (
            <a
              className="btn btn--ghost"
              href={feedbackUrl(
                {
                  kind: 'bug',
                  title: `${tool}: conversion failed (${job.error?.code ?? 'unknown'})`,
                  tool,
                  diagnostics: jobDiagnostics(job),
                },
                browserEnvironment(locale),
              )}
              target="_blank"
              rel="noopener noreferrer"
              title={t('feedback.hint')}
            >
              {t('feedback.report')}
            </a>
          )}
          {!running && (
            <button
              className="btn btn--icon"
              type="button"
              onClick={() => onRemove(job.id)}
              aria-label={t('job.remove')}
              title={t('job.remove')}
            >
              ×
            </button>
          )}
        </div>
      </header>

      <div className="job__progress">
        <div className="bar">
          <div
            className="bar__fill"
            style={{ width: `${Math.round(job.progress.fraction * 100)}%` }}
          />
        </div>
        <div className="job__status">
          {/* 每秒跳动的计时器放在朗读区外面，读屏不会每秒念一遍 */}
          <span className="job__live" aria-live="polite">
            <span className="job__stage">{stageLabel(job.progress.stage)}</span>
            <span className="job__message">{statusText}</span>
          </span>
          {timeText !== null && (
            <span className="job__time">
              {timeText}
              {eta !== null && <span className="job__eta"> · {etaText(eta, t)}</span>}
            </span>
          )}
        </div>
      </div>

      {notices.length > 0 && (
        <div className="job__notice">
          {notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      )}

      {memoryError && (
        <div className="job__notice job__notice--bad">
          <p>{t('error.memory.hint')}</p>
          {canRetryPlain && (
            <button
              className="btn"
              type="button"
              onClick={() => onRetry(job.id, { mode: 'plain-text', extractImages: false })}
            >
              {t('job.retryPlain')}
            </button>
          )}
        </div>
      )}

      {needsPassword && (
        <form
          className="job__password"
          onSubmit={(e) => {
            e.preventDefault();
            onRetry(job.id, { password });
          }}
        >
          <label htmlFor={`pwd-${job.id}`}>{t('job.password.label')}</label>
          <input
            id={`pwd-${job.id}`}
            type="password"
            value={password}
            autoComplete="off"
            placeholder={t('job.password.placeholder')}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn--primary" type="submit">
            {t('job.password.submit')}
          </button>
        </form>
      )}

      {summary !== null && (
        <p className="job__summary">
          {summary.parts.join(' · ')}
          {summary.lowConfidence > 0 && (
            <span className="pill pill--warn">
              {tn('summary.lowConfidence', summary.lowConfidence)}
            </span>
          )}
          {summary.imageBudget !== null && (
            <span className="pill pill--warn">{t('summary.imageBudget', summary.imageBudget)}</span>
          )}
        </p>
      )}

      {job.status === 'done' && job.result && (
        <>
          <button
            className="job__toggle"
            type="button"
            onClick={() => setShowReport((v) => !v)}
            aria-expanded={showReport}
          >
            {showReport ? t('job.report.hide') : t('job.report.show')}
          </button>
          {showReport && (
            <ReportView
              report={job.result.report}
              imagesOnly={imagesOnly}
              feedbackHref={feedbackUrl(
                {
                  kind: 'quality',
                  title: `${tool}: output quality`,
                  tool,
                  diagnostics: reportDiagnostics(job.result.report, job.options, job.file.size),
                },
                browserEnvironment(locale),
              )}
            />
          )}
        </>
      )}
    </article>
  );
}

/** "剩余约 3 分钟"这类粗粒度文案；一分钟以内不报具体秒数 */
function etaText(ms: number, t: I18n['t']): string {
  if (ms < 60_000) return t('job.eta.underMinute');
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t('job.eta.minutes', { count: minutes });
  return t('job.eta.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** 完成后一行摘要，不用打开报告就知道大概转出了什么、哪几页要留神 */
function summarize(
  report: ConversionReport,
  options: ConvertOptions,
  t: I18n['t'],
  tn: I18n['tn'],
): { parts: string[]; lowConfidence: number; imageBudget: MessageParams | null } {
  if (options.output === 'images') {
    const parts = [tn('summary.pages', report.pageCount)];
    // 挑了页码范围就把实际渲染出来的页号列出来，和文件名里的页码对得上
    if (options.pageRange.trim() !== '') {
      parts.push(
        t('summary.pageRange', { range: formatPageRange(report.pages.map((p) => p.index)) }),
      );
    }
    parts.push(`${options.pageImageFormat.toUpperCase()} · ${options.pageImageDpi} DPI`);
    return { parts, lowConfidence: 0, imageBudget: null };
  }
  const chars = report.pages.reduce((s, p) => s + p.characters, 0);
  const tables = report.pages.reduce((s, p) => s + p.tables, 0);
  const images = report.pages.reduce((s, p) => s + p.images, 0);
  const ocrPages = report.pages.filter((p) => p.ocrApplied).length;
  const parts = [tn('summary.pages', report.pageCount), tn('summary.characters', chars)];
  if (tables > 0) parts.push(tn('summary.tables', tables));
  if (images > 0) parts.push(tn('summary.images', images));
  if (ocrPages > 0) parts.push(tn('summary.ocrPages', ocrPages));
  // 图片超限影响的是后面所有页，值得单独挂个标签，不能只藏在报告里
  const budget = report.pages
    .flatMap((p) => p.warnings)
    .find((w) => w.code === 'image-budget-exceeded');
  return {
    parts,
    lowConfidence: report.pages.filter((p) => p.confidence < 0.6).length,
    imageBudget: budget?.params ?? null,
  };
}
