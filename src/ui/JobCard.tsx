import { useState } from 'react';
import type { ConversionReport } from '../core/contracts/report.ts';
import type { Job } from '../hooks/useConversionQueue.ts';
import { useI18n } from '../i18n/index.tsx';
import type { I18n, MessageKey } from '../i18n/index.tsx';
import { ReportView } from './ReportView.tsx';

interface JobCardProps {
  readonly job: Job;
  readonly onCancel: (id: string) => void;
  readonly onRetry: (id: string, password?: string) => void;
  readonly onRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function JobCard({ job, onCancel, onRetry, onRemove }: JobCardProps) {
  const { t, tn, stageLabel, progressText, errorText } = useI18n();
  const [password, setPassword] = useState('');
  const [showReport, setShowReport] = useState(false);
  const running = job.status === 'running' || job.status === 'queued';
  const needsPassword =
    job.error?.code === 'password-required' || job.error?.code === 'password-incorrect';
  const outputSize = job.result?.outputs.reduce((s, o) => s + o.size, 0) ?? 0;
  const statusText = job.error !== undefined ? errorText(job.error) : progressText(job.progress);
  const summary = job.result === undefined ? null : summarize(job.result.report, tn);

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
        <div className="job__status" aria-live="polite">
          <span className="job__stage">{stageLabel(job.progress.stage)}</span>
          <span className="job__message">{statusText}</span>
          {job.progress.totalPages !== undefined && job.progress.pageIndex !== undefined && (
            <span className="job__pages">
              {job.progress.pageIndex + 1}/{job.progress.totalPages}
            </span>
          )}
        </div>
      </div>

      {needsPassword && (
        <form
          className="job__password"
          onSubmit={(e) => {
            e.preventDefault();
            onRetry(job.id, password);
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
          {showReport && <ReportView report={job.result.report} />}
        </>
      )}
    </article>
  );
}

/** 完成后一行摘要，不用打开报告就知道大概转出了什么、哪几页要留神 */
function summarize(
  report: ConversionReport,
  tn: I18n['tn'],
): { parts: string[]; lowConfidence: number } {
  const chars = report.pages.reduce((s, p) => s + p.characters, 0);
  const tables = report.pages.reduce((s, p) => s + p.tables, 0);
  const images = report.pages.reduce((s, p) => s + p.images, 0);
  const ocrPages = report.pages.filter((p) => p.ocrApplied).length;
  const parts = [tn('summary.pages', report.pageCount), tn('summary.characters', chars)];
  if (tables > 0) parts.push(tn('summary.tables', tables));
  if (images > 0) parts.push(tn('summary.images', images));
  if (ocrPages > 0) parts.push(tn('summary.ocrPages', ocrPages));
  return {
    parts,
    lowConfidence: report.pages.filter((p) => p.confidence < 0.6).length,
  };
}
