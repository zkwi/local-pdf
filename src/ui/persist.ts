import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface StoredOptions<T> {
  /** 这些键不写进存储，读出来时永远用默认值（比如由页面决定的输出格式） */
  readonly omit?: readonly (keyof T)[];
  /** 合并完默认值之后再校验一遍，把过期的枚举值纠正回默认 */
  readonly fix?: (value: T) => T;
}

/**
 * 读 localStorage 里的设置：只认默认值里有、类型也一致的键，其余一律用默认值，
 * 这样新增字段、改字段类型都不会被旧数据绊倒。
 */
export function loadStored<T extends object>(
  key: string,
  defaults: T,
  { omit = [], fix }: StoredOptions<T> = {},
): T {
  let stored: unknown = null;
  try {
    const raw = localStorage.getItem(key);
    stored = raw === null ? null : JSON.parse(raw);
  } catch {
    stored = null;
  }
  const merged = { ...defaults };
  if (stored !== null && typeof stored === 'object') {
    const record = stored as Record<string, unknown>;
    for (const name of Object.keys(defaults) as (keyof T & string)[]) {
      if (omit.includes(name)) continue;
      const value = record[name];
      if (value !== undefined && typeof value === typeof defaults[name]) {
        (merged as Record<string, unknown>)[name] = value;
      }
    }
  }
  return fix === undefined ? merged : fix(merged);
}

export function saveStored<T extends object>(
  key: string,
  value: T,
  omit: readonly (keyof T)[] = [],
): void {
  const copy: Partial<T> = { ...value };
  for (const name of omit) delete copy[name];
  try {
    localStorage.setItem(key, JSON.stringify(copy));
  } catch {
    /* 隐私模式或存满了：设置只在本次会话里生效 */
  }
}

/** 和 useState 一样用，只是初值从 localStorage 来、改了自动写回去 */
export function useStored<T extends object>(
  key: string,
  defaults: T,
  options: StoredOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadStored(key, defaults, options));
  const omit = options.omit;
  useEffect(() => {
    saveStored(key, value, omit);
  }, [key, omit, value]);
  return [value, setValue];
}
