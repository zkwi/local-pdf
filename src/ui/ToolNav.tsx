import type { MouseEvent, ReactElement } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';
import { toolHref } from './router.ts';
import { TOOLS } from './tools.ts';
import type { Tool, ToolActivity, ToolGroup, ToolId } from './tools.ts';

type Kind = 'word' | 'markdown' | 'images';

function kindOf(tool: Tool): Kind {
  if (tool.id.includes('word')) return 'word';
  if (tool.id.includes('markdown')) return 'markdown';
  return 'images';
}

const GROUPS: readonly ToolGroup[] = ['from-pdf', 'to-pdf'];

/**
 * 六个工具分两组摆在顶栏下面：左边"从 PDF 转出"，右边"转成 PDF"，每组三个。
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
        <div className="toolnav__group" key={group}>
          <span className="toolnav__label">
            {t(group === 'from-pdf' ? 'nav.fromPdf' : 'nav.toPdf')}
          </span>
          <ul className="toolnav__list">
            {TOOLS.filter((tool) => tool.group === group).map((tool) => {
              const on = tool.id === active.id;
              const kind = kindOf(tool);
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
};
