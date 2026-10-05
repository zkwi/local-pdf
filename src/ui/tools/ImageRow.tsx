import type { ImageNote } from '../../core/image/compress.ts';
import { directoryOf } from '../../core/image/plan.ts';
import type { EncodeFormat } from '../../core/image/plan.ts';
import type { SourceFormat } from '../../core/image/sniff.ts';
import { isSvgItem, retryable } from '../../hooks/useImageBatch.ts';
import type { ImageItem } from '../../hooks/useImageBatch.ts';
import { useI18n } from '../../i18n/index.tsx';
import { formatSize } from '../format.ts';
import type { ImageToolId } from '../tools.ts';

export const FORMAT_LABEL: Readonly<Record<SourceFormat | EncodeFormat, string>> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  bmp: 'BMP',
  avif: 'AVIF',
  heic: 'HEIC',
  tiff: 'TIFF',
  ico: 'ICO',
  svg: 'SVG',
  unknown: '?',
};

interface ImageRowProps {
  readonly item: ImageItem;
  readonly tool: ImageToolId;
  /** 这一批还在处理：待处理的行显示「等待中」而不是「待处理」 */
  readonly busy: boolean;
  readonly onCompare: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onRetry: (id: string) => void;
  /** 缩略图加载出来后报告真实尺寸（已按 EXIF 摆正） */
  readonly onMeasured: (id: string, width: number, height: number) => void;
  /** 浏览器显示不了这张图（缩略图和对比都用不了） */
  readonly onUnpreviewable: (id: string) => void;
}

/** 图片列表里的一行：缩略图、原图和结果的格式尺寸大小、提示、状态和操作 */
export function ImageRow({
  item,
  tool,
  busy,
  onCompare,
  onRemove,
  onRetry,
  onMeasured,
  onUnpreviewable,
}: ImageRowProps) {
  const { t } = useI18n();
  const result = item.result;
  const dir = directoryOf(item.path);
  const vector = isSvgItem(item);
  // 矢量图和位图比体积没有意义，SVG 不显示增减
  const grew = !vector && result !== undefined && !result.kept && result.blob.size > item.file.size;

  const noteText = (note: ImageNote): string => {
    const p = note.params ?? {};
    switch (note.code) {
      case 'format-changed':
        return t('img.note.format', { format: FORMAT_LABEL[p.format as EncodeFormat] ?? '' });
      case 'alpha-filled':
        return t('img.note.alpha');
      case 'limited':
        return t('img.note.limited', { width: p.width, height: p.height });
      case 'target-shrunk':
        return t('img.note.shrunk', { width: p.width, height: p.height });
      case 'target-missed':
        return t('img.note.missed', { size: formatSize(Number(p.size)) });
      case 'dpi-ignored':
        return t('img.note.dpi');
      case 'palette':
        return t('img.note.palette', { colors: p.colors });
      case 'unchanged':
        return t('img.note.unchanged');
      case 'within-target':
        return t('img.note.withinTarget', { size: formatSize(Number(p.size)) });
      case 'not-smaller':
        return t('img.note.notSmaller');
    }
  };

  const errorText = (): string => {
    switch (item.error) {
      case 'animated':
        return t('img.error.animated');
      case 'decode':
      case 'svg':
        return item.header?.format === 'heic'
          ? t('img.error.heic')
          : t('img.error.decode', { format: FORMAT_LABEL[item.header?.format ?? 'unknown'] });
      case 'memory':
      case 'crashed':
        return t('img.error.memory');
      case 'encode':
        return t('img.error.encode');
      default:
        return t('img.error.unknown', { detail: item.detail ?? '' });
    }
  };

  const statusText = (): string => {
    switch (item.status) {
      case 'ready':
        return t(busy ? 'img.status.queued' : 'img.status.ready');
      case 'processing':
        return t('img.status.processing');
      case 'kept':
        return t('img.status.kept');
      case 'skipped':
        return t('img.status.skipped');
      case 'failed':
        return t('img.status.failed');
      case 'done': {
        if (vector) return t('img.status.done');
        const size = result?.blob.size ?? 0;
        const change = Math.round((1 - size / Math.max(1, item.file.size)) * 100);
        return change >= 0 ? `−${change}%` : `+${-change}%`;
      }
    }
  };

  // SVG 一定会变成位图格式，「已改存为 PNG」不用再说
  const parts =
    result?.notes.filter((note) => !(vector && note.code === 'format-changed')).map(noteText) ?? [];
  if (vector && result !== undefined) {
    parts.unshift(t('img.note.svg', { width: result.width, height: result.height }));
    // 只有「调整尺寸」能放大 SVG，别的工具里指个路
    if (tool !== 'resize-images') parts.splice(1, 0, t('img.note.svgResize'));
  }
  if (grew) parts.push(t('img.note.larger'));
  const failed = item.status === 'failed' || item.status === 'skipped';
  const message = failed ? errorText() : parts.join(' · ');
  const tone =
    item.status === 'failed'
      ? ' imgrow__note--bad'
      : item.status === 'skipped' || grew
        ? ' imgrow__note--warn'
        : '';
  const sourceFormat = item.header?.format;
  const comparable = result !== undefined && !result.kept && item.previewable;
  const statusTone =
    item.status === 'done' && !grew ? ' imgrow__status--good' : grew ? ' imgrow__status--warn' : '';

  return (
    <li className={`imgrow imgrow--${item.status}`}>
      <button
        type="button"
        className="imgrow__thumb"
        disabled={!comparable}
        onClick={() => onCompare(item.id)}
        aria-label={t('img.compare.open', { name: item.file.name })}
        title={comparable ? t('img.compare.open', { name: item.file.name }) : undefined}
      >
        {item.previewable ? (
          <img
            src={item.url}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (item.width !== naturalWidth || item.height !== naturalHeight) {
                onMeasured(item.id, naturalWidth, naturalHeight);
              }
            }}
            onError={() => onUnpreviewable(item.id)}
          />
        ) : (
          <span className="imgrow__badge">{FORMAT_LABEL[sourceFormat ?? 'unknown']}</span>
        )}
      </button>
      <div className="imgrow__info">
        <span className="imgrow__name" title={item.path || item.file.name}>
          {dir !== '' && <span className="imgrow__dir">{dir}</span>}
          {item.file.name}
        </span>
        <span className="imgrow__meta">
          <span>
            {[
              sourceFormat !== undefined && sourceFormat !== 'unknown'
                ? FORMAT_LABEL[sourceFormat]
                : null,
              item.width !== undefined && item.height !== undefined
                ? `${item.width} × ${item.height}`
                : null,
              formatSize(item.file.size),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {result !== undefined && !result.kept && (
            <>
              <span className="imgrow__arrow" aria-hidden="true">
                →
              </span>
              <span className="imgrow__out">
                {FORMAT_LABEL[result.format]} · {result.width} × {result.height} ·{' '}
                {formatSize(result.blob.size)}
              </span>
            </>
          )}
        </span>
        {message !== '' && <span className={`imgrow__note${tone}`}>{message}</span>}
      </div>
      <div className="imgrow__side">
        <span
          className={`imgrow__status${statusTone}`}
          role={item.status === 'processing' ? 'status' : undefined}
        >
          {item.status === 'processing' && <span className="spinner" aria-hidden="true" />}
          {statusText()}
        </span>
        <div className="imgrow__actions">
          {comparable && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onCompare(item.id)}
            >
              {t('img.compare')}
            </button>
          )}
          {result !== undefined && (
            <a className="btn btn--ghost btn--small" href={result.url} download={result.name}>
              {t('img.download')}
            </a>
          )}
          {item.status === 'failed' && retryable(item.error) && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onRetry(item.id)}
            >
              {t('job.retry')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--icon"
            disabled={item.status === 'processing'}
            aria-label={t('img.remove', { name: item.file.name })}
            title={t('compose.remove')}
            onClick={() => onRemove(item.id)}
          >
            ×
          </button>
        </div>
      </div>
    </li>
  );
}
