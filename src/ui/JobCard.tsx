import { useState } from 'react';
import type { Job } from '../hooks/useConversionQueue.ts';
import { ReportView } from './ReportView.tsx';

interface JobCardProps {
  readonly job: Job;
  readonly onCancel: (id: string) => void;
  readonly onRetry: (id: string, password?: string) => void;
  readonly onRemove: (id: string) => void;
}

const STAGE_LABEL: Record<string, string> = {
  queued: '排队中',
  loading: '解析 PDF',
  extracting: '读取内容',
  ocr: 'OCR 识别',
  analyzing: '分析版面',
  writing: '生成 Word',
  completed: '完成',
  failed: '失败',
  cancelled: '已取消',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function JobCard({ job, onCancel, onRetry, onRemove }: JobCardProps) {
  const [password, setPassword] = useState('');
  const [showReport, setShowReport] = useState(false);
  const running = job.status === 'running' || job.status === 'queued';
  const needsPassword =
    job.error?.code === 'password-required' || job.error?.code === 'password-incorrect';

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
              取消
            </button>
          )}
          {job.status === 'done' && job.result && (
            <a className="btn btn--primary" href={job.result.url} download={job.result.fileName}>
              下载 DOCX
            </a>
          )}
          {(job.status === 'error' || job.status === 'cancelled') && !needsPassword && (
            <button className="btn btn--ghost" type="button" onClick={() => onRetry(job.id)}>
              重试
            </button>
          )}
          {!running && (
            <button
              className="btn btn--icon"
              type="button"
              onClick={() => onRemove(job.id)}
              aria-label="移除"
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
          <span className="job__stage">{STAGE_LABEL[job.progress.stage] ?? job.progress.stage}</span>
          <span className="job__message">{job.progress.message}</span>
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
          <label htmlFor={`pwd-${job.id}`}>这份 PDF 有打开密码</label>
          <input
            id={`pwd-${job.id}`}
            type="password"
            value={password}
            autoComplete="off"
            placeholder="输入密码后重试"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn--primary" type="submit">
            解锁并转换
          </button>
        </form>
      )}

      {job.status === 'error' && !needsPassword && (
        <p className="job__error">{job.error?.message}</p>
      )}

      {job.status === 'done' && job.result && (
        <>
          <button
            className="job__toggle"
            type="button"
            onClick={() => setShowReport((v) => !v)}
            aria-expanded={showReport}
          >
            {showReport ? '收起转换报告' : '查看转换报告'}
          </button>
          {showReport && <ReportView report={job.result.report} />}
        </>
      )}
    </article>
  );
}
