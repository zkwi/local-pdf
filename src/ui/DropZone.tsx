import { useCallback, useRef } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';

export type DropKind = 'pdf' | 'word' | 'markdown' | 'images';

interface DropZoneProps {
  readonly onFiles: (files: readonly File[]) => void;
  /** 点"试试示例 PDF"时调用；没有就不显示这一行 */
  readonly onSample?: () => void;
  /** 队列下面的"继续添加"：一行横排，不放说明和示例链接 */
  readonly compact?: boolean;
  readonly disabled?: boolean;
  /** 文案按工具切换 */
  readonly kind?: DropKind;
  /** 文件选择框的 accept */
  readonly accept?: string;
}

export interface SplitFiles {
  readonly pdfs: File[];
  readonly rejected: number;
}

/** 只收 PDF；别的文件数一下，让界面告诉用户被忽略了几个，而不是悄无声息 */
export function splitPdfs(list: FileList | readonly File[] | null): SplitFiles {
  if (list === null) return { pdfs: [], rejected: 0 };
  const files = [...list];
  const pdfs = files.filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  return { pdfs, rejected: files.length - pdfs.length };
}

interface Labels {
  readonly title: MessageKey;
  readonly hint: MessageKey;
  readonly choose: MessageKey;
  readonly more: MessageKey;
  /** 提示里要不要加"也可以 Ctrl+V 粘贴"那一行 */
  readonly paste: boolean;
}

const LABELS: Record<DropKind, Labels> = {
  pdf: {
    title: 'drop.title',
    hint: 'drop.hint',
    choose: 'drop.choose',
    more: 'drop.more',
    paste: true,
  },
  word: {
    title: 'drop.title.word',
    hint: 'drop.hint',
    choose: 'drop.choose.word',
    more: 'drop.more.word',
    paste: true,
  },
  markdown: {
    title: 'drop.title.markdown',
    hint: 'drop.hint.markdown',
    choose: 'drop.choose.markdown',
    more: 'drop.more.markdown',
    paste: false,
  },
  images: {
    title: 'drop.title.images',
    hint: 'drop.hint.images',
    choose: 'drop.choose.images',
    more: 'drop.more.images',
    paste: false,
  },
};

/**
 * 点击/键盘触发文件选择。拖放和粘贴由 App 在 window 上统一接管
 * （整页都是投放区，拖动时有全屏提示），这里不再单独处理。
 */
export function DropZone({
  onFiles,
  onSample,
  compact = false,
  disabled = false,
  kind = 'pdf',
  accept = 'application/pdf,.pdf',
}: DropZoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const labels = LABELS[kind];

  const open = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const className = [
    'dropzone',
    compact ? 'dropzone--compact' : '',
    disabled ? 'dropzone--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t(labels.choose)}
    >
      <span className="dropzone__orb" aria-hidden="true">
        <svg className="dropzone__icon" viewBox="0 0 48 48">
          <path
            d="M24 32V12m0 0-7 7m7-7 7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 30v4a6 6 0 0 0 6 6h20a6 6 0 0 0 6-6v-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {compact ? (
        <p className="dropzone__title">{t(labels.more)}</p>
      ) : (
        <>
          <p className="dropzone__title">{t(labels.title)}</p>
          <p className="dropzone__hint">
            {t(labels.hint)}
            {labels.paste && <span className="dropzone__hint-line">{t('drop.paste')}</span>}
          </p>
        </>
      )}
      <span
        className={`btn ${compact ? 'btn--ghost' : 'btn--primary'} dropzone__button`}
        aria-hidden="true"
      >
        {t(labels.choose)}
      </span>
      {!compact && onSample !== undefined && (
        <button
          type="button"
          className="link dropzone__sample"
          onClick={(e) => {
            // 不让点击冒泡到外层，否则会同时打开文件选择框
            e.stopPropagation();
            onSample();
          }}
        >
          {t('drop.sample')}
        </button>
      )}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={accept}
        multiple
        tabIndex={-1}
        // 不阻止冒泡的话，input.click() 会再次触发外层 div 的 onClick，
        // 文件选择器被打开两次，第一个会被第二个顶掉
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
