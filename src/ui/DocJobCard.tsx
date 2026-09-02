import type { DocJob } from '../hooks/useToPdfQueue.ts';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';
import { formatClock } from './eta.ts';
import { formatSize } from './format.ts';

interface DocJobCardProps {
  readonly job: DocJob;
  readonly onCancel: (id: string) => void;
  readonly onRetry: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

/** Word / Markdown 转 PDF 的任务卡：进度、结果、下载；比 PDF 那边简单，没有报告和密码 */
export function DocJobCard({ job, onCancel, onRetry, onRemove }: DocJobCardProps) {
  const { t, tn } = useI18n();
  const running = job.status === 'running' || job.status === 'queued';

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
    default: {
      // docx-preview 解不开 zip 时抛的是 "end of central directory" 这类内部错误，换成人话
      const detail = job.error ?? '';
      const invalid =
        job.source === 'word' && /central directory|zip|corrupt|end of data|invalid/i.test(detail);
      status = invalid ? t('topdf.error.invalid') : t('topdf.failed', { detail });
    }
  }
  const duration =
    job.status === 'done' && job.startedAt !== undefined && job.finishedAt !== undefined
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
          {(job.status === 'error' || job.status === 'cancelled') && (
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
        </p>
      )}
    </article>
  );
}
