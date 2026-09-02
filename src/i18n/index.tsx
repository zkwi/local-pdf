import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ConversionWarning } from '../core/contracts/layout.ts';
import type { Locale } from '../core/contracts/options.ts';
import type {
  ConversionProgress,
  ConversionStage,
  MessageParams,
} from '../core/contracts/report.ts';
import type { WorkerError } from '../worker/protocol.ts';
import { en } from './messages/en.ts';
import { ja } from './messages/ja.ts';
import { zhCN } from './messages/zh-CN.ts';
import type { MessageKey, Messages } from './messages/zh-CN.ts';
import { zhTW } from './messages/zh-TW.ts';

export type { Locale, MessageKey };

const MESSAGES: Record<Locale, Messages> = { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja };

export const LOCALES: readonly { readonly value: Locale; readonly label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

const STORAGE_KEY = 'local-pdf.locale';
/** 每种语言有自己的 URL（?lang=），搜索引擎才能分别收录；hreflang 在 index.html 里 */
const LANG_PARAM = 'lang';

function isLocale(value: string | null): value is Locale {
  return value !== null && value in MESSAGES;
}

function localeFromUrl(): Locale | null {
  const value = new URLSearchParams(location.search).get(LANG_PARAM);
  return isLocale(value) ? value : null;
}

function matchLocale(tag: string): Locale | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) {
    // zh-TW / zh-HK / zh-MO / zh-Hant-* 走繁体，其余中文走简体
    return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  }
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('en')) return 'en';
  return null;
}

/** 优先级：URL 参数 → 上次的选择 → 浏览器语言 → 英文 */
export function detectLocale(): Locale {
  const fromUrl = localeFromUrl();
  if (fromUrl !== null) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* 隐私模式可能禁用 localStorage */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const hit = matchLocale(tag);
    if (hit !== null) return hit;
  }
  return 'en';
}

export function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export interface I18n {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: MessageKey, params?: MessageParams) => string;
  /** 按数量选 `${key}.one` / `${key}.other`，count 自动进 params */
  readonly tn: (key: string, count: number, params?: MessageParams) => string;
  readonly progressText: (progress: ConversionProgress) => string;
  readonly stageLabel: (stage: ConversionStage) => string;
  readonly warningText: (warning: ConversionWarning) => string;
  readonly errorText: (error: WorkerError) => string;
}

const I18nContext = createContext<I18n | null>(null);

function setHeadTag(
  selector: string,
  create: () => HTMLElement,
  apply: (el: HTMLElement) => void,
): void {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (el === null) {
    el = create();
    document.head.append(el);
  }
  apply(el);
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    // 把语言写进 URL：分享出去的链接带着语言，搜索引擎也按语言分别收录
    const url = new URL(location.href);
    url.searchParams.set(LANG_PARAM, next);
    history.replaceState(null, '', url);
  }, []);

  const value = useMemo<I18n>(() => {
    const messages = MESSAGES[locale];
    const t = (key: MessageKey, params?: MessageParams): string =>
      interpolate(messages[key] ?? zhCN[key] ?? key, params);
    const tn = (key: string, count: number, params?: MessageParams): string =>
      t(`${key}.${count === 1 ? 'one' : 'other'}` as MessageKey, { count, ...params });
    return {
      locale,
      setLocale,
      t,
      tn,
      progressText: (p) => t(`progress.${p.key}` as MessageKey, p.params),
      stageLabel: (stage) => t(`stage.${stage}` as MessageKey),
      warningText: (w) =>
        t(`warning.${w.code}` as MessageKey, {
          page: w.pageIndex !== undefined ? w.pageIndex + 1 : '',
          ...w.params,
        }),
      errorText: (e) =>
        e.code === 'unknown' && e.detail === 'read-file'
          ? t('error.read-file')
          : t(`error.${e.code}` as MessageKey, { detail: e.detail ?? '' }),
    };
  }, [locale, setLocale]);

  // <head> 里跟语言走的东西：lang、标题、描述、canonical
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.t('app.docTitle');
    setHeadTag(
      'meta[name="description"]',
      () => Object.assign(document.createElement('meta'), { name: 'description' }),
      (el) => el.setAttribute('content', value.t('meta.description')),
    );
    const canonical = new URL(location.pathname, location.origin);
    if (localeFromUrl() !== null) canonical.searchParams.set(LANG_PARAM, locale);
    setHeadTag(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement('link'), { rel: 'canonical' }),
      (el) => el.setAttribute('href', canonical.href),
    );
  }, [locale, value]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (ctx === null) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
