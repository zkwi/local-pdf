import type { DocJob } from '../hooks/useToPdfQueue.ts';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';
import { formatClock } from './eta.ts';
import { browserEnvironment, docJobDiagnostics, feedbackUrl } from './feedback.ts';
import { formatSize } from './format.ts';

interface DocJobCardProps {
  readonly job: DocJob;
  readonly onCancel: (id: string) => void;
  readonly onRetry: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

/** Word / Markdown 转 PDF 的任务卡：进度、结果、下载；比 PDF 那边简单，没有报告和密码 */
export function DocJobCard({ job, onCancel, onRetry, onRemove }: DocJobCardProps) {
  const { t, tn, locale } = useI18n();
  const running = job.status === 'running' || job.status === 'queued';
  const tool = job.source === 'word' ? 'word-to-pdf' : 'markdown-to-pdf';
  // docx-preview 解不开 zip 时抛的是 "end of central directory" 这类内部错误：文件本身坏了，换成人话，也不给重试
  const invalid =
    job.status === 'error' &&
    job.source === 'word' &&
    /central directory|zip|corrupt|end of data|invalid/i.test(job.error ?? '');

  let status: string;
  switch (job.status) {
    case 'queued':
      status = t('topdf.queued');
      break;
    case 'running':
      status = t(`topdf.stage.${job.stage ?? 'render'}` as MessageKey);
      break;
    case 'done':
      status = t('topdf.done');
      break;
    case 'cancelled':
      status = t('topdf.cancelled');
      break;
    default:
      status = invalid ? t('topdf.error.invalid') : t('topdf.failed', { detail: job.error ?? '' });
  }
  // 不到一秒就做完的不写「用时 0:00」
  const duration =
    job.status === 'done' &&
    job.startedAt !== undefined &&
    job.finishedAt !== undefined &&
    job.finishedAt - job.startedAt >= 1000
      ? t('job.duration', { time: formatClock(job.finishedAt - job.startedAt) })
      : null;

  return (
    <article className={`job job--${job.status}`}>
      <header className="job__head">
        <div className="job__id">
          <span className="job__name" title={job.file.name}>
            {job.file.name}
          </span>
          <span className="job__meta">
            {formatSize(job.file.size)}
            {job.result && ` → ${formatSize(job.result.size)}`}
          </span>
        </div>
        <div className="job__actions">
          {running && (
            <button className="btn btn--ghost" type="button" onClick={() => onCancel(job.id)}>
              {t('job.cancel')}
            </button>
          )}
          {job.status === 'done' && job.result && (
            <a
              className="btn btn--primary"
              href={job.result.url}
              download={job.result.fileName}
              title={`${job.result.fileName} (${formatSize(job.result.size)})`}
            >
              {t('topdf.download')}
            </a>
          )}
          {(job.status === 'error' || job.status === 'cancelled') && !invalid && (
            <button className="btn btn--ghost" type="button" onClick={() => onRetry(job.id)}>
              {t('job.retry')}
            </button>
          )}
          {job.status === 'error' && (
            <a
              className="btn btn--ghost"
              href={feedbackUrl(
                {
                  kind: 'bug',
                  title: `${tool}: conversion failed`,
                  tool,
                  diagnostics: docJobDiagnostics(job),
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
          <div className="bar__fill" style={{ width: `${Math.round(job.fraction * 100)}%` }} />
        </div>
        <div className="job__status">
          <span className="job__live" aria-live="polite">
            <span className="job__message">{status}</span>
          </span>
          {duration !== null && <span className="job__time">{duration}</span>}
        </div>
      </div>

      {job.result && (
        <p className="job__summary">
          {tn('summary.pages', job.result.pages)}
          {job.result.imagesSkipped > 0 && (
            <span className="pill pill--warn">
              {tn('topdf.imagesSkipped', job.result.imagesSkipped)}
            </span>
          )}
          {job.result.unsupportedImageFormats.length > 0 && (
            <span className="pill pill--warn">
              {t('topdf.unsupportedImages', {
                formats: job.result.unsupportedImageFormats.join(', '),
              })}
            </span>
          )}
          {job.result.charactersReplaced > 0 && (
            <span className="pill pill--warn">
              {t('topdf.charactersReplaced', { count: job.result.charactersReplaced })}
            </span>
          )}
          {job.result.blockedContent > 0 && (
            <span className="pill pill--warn">
              {t('topdf.blockedContent', { count: job.result.blockedContent })}
            </span>
          )}
        </p>
      )}
    </article>
  );
}
