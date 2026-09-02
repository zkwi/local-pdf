import { useEffect, useState } from 'react';
import type { ConvertOptions } from '../core/contracts/options.ts';
import type { ConversionReport, MessageParams } from '../core/contracts/report.ts';
import type { Job } from '../hooks/useConversionQueue.ts';
import { useI18n } from '../i18n/index.tsx';
import type { I18n, MessageKey } from '../i18n/index.tsx';
import { estimateRemainingMs, formatClock } from './eta.ts';
import { formatSize } from './format.ts';
import { ReportView } from './ReportView.tsx';

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
  const { t, tn, stageLabel, progressText, errorText } = useI18n();
  const [password, setPassword] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [slowNoticed, setSlowNoticed] = useState(false);
  const running = job.status === 'running' || job.status === 'queued';
  const needsPassword =
    job.error?.code === 'password-required' || job.error?.code === 'password-incorrect';
  const memoryError = job.error?.code === 'out-of-memory' || job.error?.code === 'worker-crashed';
  const outputSize = job.result?.outputs.reduce((s, o) => s + o.size, 0) ?? 0;
  const statusText = job.error !== undefined ? errorText(job.error) : progressText(job.progress);
  const imagesOnly = job.options.output === 'images';
  const summary = job.result === undefined ? null : summarize(job.result.report, job.options, tn);

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
  if (running && pages !== undefined && documentPages !== undefined && documentPages > pages) {
    notices.push(t('job.pageLimit', { total: documentPages, limit: pages }));
  }
  // 图片模式没有"只要文字"可退：内存不够只能降清晰度或拆文件
  const canRetryPlain =
    !imagesOnly && (job.options.mode !== 'plain-text' || job.options.extractImages);

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
          {showReport && <ReportView report={job.result.report} imagesOnly={imagesOnly} />}
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
  tn: I18n['tn'],
): { parts: string[]; lowConfidence: number; imageBudget: MessageParams | null } {
  if (options.output === 'images') {
    return {
      parts: [
        tn('summary.pages', report.pageCount),
        `${options.pageImageFormat.toUpperCase()} · ${options.pageImageDpi} DPI`,
      ],
      lowConfidence: 0,
      imageBudget: null,
    };
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
