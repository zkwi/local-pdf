import { useCallback, useRef } from 'react';
import { useI18n } from '../i18n/index.tsx';

interface DropZoneProps {
  readonly onFiles: (files: readonly File[]) => void;
  /** 点"试试示例 PDF"时调用；没有就不显示这一行 */
  readonly onSample?: () => void;
  readonly disabled?: boolean;
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

/**
 * 点击/键盘触发文件选择。拖放和粘贴由 App 在 window 上统一接管
 * （整页都是投放区，拖动时有全屏提示），这里不再单独处理。
 */
export function DropZone({ onFiles, onSample, disabled = false }: DropZoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  return (
    <div
      className={`dropzone${disabled ? ' dropzone--disabled' : ''}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t('drop.choose')}
    >
      <svg className="dropzone__icon" viewBox="0 0 48 48" aria-hidden="true">
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
      <p className="dropzone__title">{t('drop.title')}</p>
      <p className="dropzone__hint">
        {t('drop.hint')}
        <span className="dropzone__hint-line">{t('drop.paste')}</span>
      </p>
      <span className="btn btn--primary dropzone__button" aria-hidden="true">
        {t('drop.choose')}
      </span>
      {onSample !== undefined && (
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
        accept="application/pdf,.pdf"
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
