import { useI18n } from '../i18n/index.tsx';

/** 主面板设置行右侧的"更多选项"开关；改过默认设置时亮一个点 */
export function PanelMore({
  open,
  changed,
  controls,
  onToggle,
}: {
  readonly open: boolean;
  readonly changed: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`panel__more${open ? ' panel__more--open' : ''}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3 5h7M14 5h3M3 10h2M9 10h8M3 15h9M16 15h1" />
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="7" cy="10" r="1.8" />
          <circle cx="14" cy="15" r="1.8" />
        </g>
      </svg>
      <span>{t('advanced.toggle')}</span>
      {changed && <span className="panel__dot" aria-hidden="true" />}
      <span className="panel__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
