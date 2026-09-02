import type { CSSProperties, ReactElement } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';
import type { ToolGroup } from './tools.ts';

type Item = 'local' | 'editable' | 'ocr' | 'free' | 'vector' | 'compose';

/** 两个方向各自的四张卖点卡：本地和免费共用，中间两张按方向换 */
const ITEMS: Record<ToolGroup, readonly Item[]> = {
  'from-pdf': ['local', 'editable', 'ocr', 'free'],
  'to-pdf': ['local', 'vector', 'compose', 'free'],
};

/**
 * 拖放区下面的四张卖点卡。一眼看清"为什么用这个"，比散落各处的小标签清楚。
 * 整个区块是首屏第 2 个入场的，四张卡再各自错开一点（见 styles.css 的 .reveal）。
 */
export function Features({ group }: { readonly group: ToolGroup }) {
  const { t } = useI18n();
  return (
    <section
      className="features reveal"
      style={{ '--i': 2 } as CSSProperties}
      aria-labelledby="features-title"
    >
      <h2 id="features-title" className="eyebrow">
        {t('features.label')}
      </h2>
      <ul className="features__list">
        {ITEMS[group].map((item, index) => (
          <li key={item} className="features__item" style={{ '--i': index } as CSSProperties}>
            <span className="features__icon" aria-hidden="true">
              {ICONS[item]}
            </span>
            <div>
              <h3 className="features__title">{t(`features.${item}.title` as MessageKey)}</h3>
              <p className="features__body">{t(`features.${item}.body` as MessageKey)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ICONS: Record<Item, ReactElement> = {
  local: (
    <svg viewBox="0 0 24 24">
      <path d="M12 3 4.5 6v5.2c0 4.6 3.2 8.4 7.5 9.8 4.3-1.4 7.5-5.2 7.5-9.8V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  editable: (
    <svg viewBox="0 0 24 24">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  ocr: (
    <svg viewBox="0 0 24 24">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </svg>
  ),
  free: (
    <svg viewBox="0 0 24 24">
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
    </svg>
  ),
  vector: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h6" />
      <path d="M15 15v5M13 17.5h4" />
    </svg>
  ),
  compose: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  ),
};
