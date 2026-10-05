import type { MouseEvent, ReactElement } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';
import { toolHref } from './router.ts';
import { TOOLS } from './tools.ts';
import type { Tool, ToolActivity, ToolGroup, ToolId } from './tools.ts';

type Kind = 'word' | 'markdown' | 'images' | 'compress' | 'convert' | 'resize';

const KIND: Record<ToolId, Kind> = {
  'pdf-to-word': 'word',
  'pdf-to-markdown': 'markdown',
  'pdf-to-images': 'images',
  'word-to-pdf': 'word',
  'markdown-to-pdf': 'markdown',
  'images-to-pdf': 'images',
  'compress-images': 'compress',
  'convert-images': 'convert',
  'resize-images': 'resize',
};

const GROUPS: readonly ToolGroup[] = ['from-pdf', 'to-pdf', 'image'];

const GROUP_LABEL: Record<ToolGroup, MessageKey> = {
  'from-pdf': 'nav.fromPdf',
  'to-pdf': 'nav.toPdf',
  image: 'nav.imageTools',
};

/**
 * 九个工具分三组摆在顶栏下面："从 PDF 转出"、"转成 PDF"、"图片工具"，每组三个。
 * 是真正的链接（有 href，能中键打开），普通点击走站内切换不刷新页面。
 */
export function ToolNav({
  active,
  activity,
  onSelect,
}: {
  readonly active: Tool;
  readonly activity: Readonly<Record<ToolId, ToolActivity>>;
  readonly onSelect: (tool: Tool) => void;
}) {
  const { t } = useI18n();
  const handle = (event: MouseEvent<HTMLAnchorElement>, tool: Tool): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onSelect(tool);
  };
  return (
    <nav className="toolnav" aria-label={t('nav.label')}>
      {GROUPS.map((group) => (
        <div
          className={`toolnav__group${group === active.group ? ' toolnav__group--on' : ''}`}
          key={group}
        >
          <span className="toolnav__label">{t(GROUP_LABEL[group])}</span>
          <ul className="toolnav__list">
            {TOOLS.filter((tool) => tool.group === group).map((tool) => {
              const on = tool.id === active.id;
              const kind = KIND[tool.id];
              const state = activity[tool.id];
              const toolTitle = t(`tool.${tool.id}.title` as MessageKey);
              const accessibleTitle =
                state.count === 0
                  ? toolTitle
                  : t(state.busy ? 'nav.activity.busy' : 'nav.activity.saved', {
                      tool: toolTitle,
                      count: state.count,
                    });
              return (
                <li key={tool.id}>
                  <a
                    href={toolHref(tool)}
                    className={`toolnav__item${on ? ' toolnav__item--on' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    aria-label={accessibleTitle}
                    title={accessibleTitle}
                    onClick={(e) => handle(e, tool)}
                  >
                    {ICONS[kind]}
                    <span>{t(`nav.${kind}` as MessageKey)}</span>
                    {state.count > 0 && (
                      <span
                        className="toolnav__activity"
                        data-busy={state.busy || undefined}
                        aria-hidden="true"
                      >
                        {state.count > 99 ? '99+' : state.count}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const ICONS: Record<Kind, ReactElement> = {
  word: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  markdown: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15V9l2.5 3L12 9v6M16 9v6m0 0-2-2m2 2 2-2" />
    </svg>
  ),
  images: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  ),
  // 四角向里收：压缩
  compress: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
    </svg>
  ),
  // 两个方向的箭头：转换格式
  convert: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" />
    </svg>
  ),
  // 带对角拉伸箭头的框：改尺寸
  resize: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="11" width="10" height="10" rx="1.5" />
      <path d="M13 3h8v8M21 3l-7.5 7.5" />
    </svg>
  ),
};
