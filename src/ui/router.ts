import { useCallback, useSyncExternalStore } from 'react';
import { HOME, TOOLS } from './tools.ts';
import type { Tool } from './tools.ts';

/**
 * 路径路由，不引入路由库：每个工具一个路径（/word-to-pdf），首页是 PDF 转 Word。
 * 站点根从当前路径推出来，托管在子目录下也能用；?lang= 参数在跳转时保留。
 */

function currentTool(pathname: string): { tool: Tool; root: string } {
  const trimmed = pathname.replace(/\/+$/, '');
  const slug = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  const tool = TOOLS.find((t) => t.slug !== '' && t.slug === slug);
  if (tool === undefined) return { tool: HOME, root: `${trimmed}/` };
  return { tool, root: trimmed.slice(0, trimmed.length - slug.length) };
}

export function toolHref(tool: Tool): string {
  const { root } = currentTool(location.pathname);
  const url = new URL(root + tool.slug, location.href);
  const lang = new URLSearchParams(location.search).get('lang');
  if (lang !== null) url.searchParams.set('lang', lang);
  return url.pathname + url.search;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function snapshot(): Tool {
  return currentTool(location.pathname).tool;
}

export function useTool(): [Tool, (tool: Tool) => void] {
  const tool = useSyncExternalStore(subscribe, snapshot, () => HOME);
  const navigate = useCallback((next: Tool) => {
    if (next.id === snapshot().id) return;
    history.pushState(null, '', toolHref(next));
    for (const listener of listeners) listener();
    window.scrollTo({ top: 0 });
  }, []);
  return [tool, navigate];
}
