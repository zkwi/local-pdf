import { createContext, useContext, useEffect } from 'react';

/**
 * 页面外壳给工具页的两样东西：
 * - 全局拖放 / 粘贴收到的文件交给当前工具（sink 返回 true 表示收下了）；
 * - 底部的提示条。
 */
export type FileSink = (files: readonly File[], text?: string) => boolean;

export interface Shell {
  readonly setSink: (sink: FileSink | null) => void;
  readonly toast: (message: string) => void;
}

export const ShellContext = createContext<Shell>({
  setSink: () => undefined,
  toast: () => undefined,
});

export function useShell(): Shell {
  return useContext(ShellContext);
}

/** 当前可见的工具页注册自己的文件接收器；不可见时传 null */
export function useFileSink(active: boolean, sink: FileSink): void {
  const { setSink } = useShell();
  useEffect(() => {
    if (!active) return;
    setSink(sink);
    return () => setSink(null);
  }, [active, setSink, sink]);
}
