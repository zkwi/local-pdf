import type { ConvertOptions, Locale, OcrLanguage } from '../contracts/options.ts';

export interface OcrLanguageSpec {
  readonly value: OcrLanguage;
  /** PaddleOCR.js 的 lang 参数 */
  readonly paddle: 'ch' | 'chinese_cht' | 'en' | 'japan';
}

export const OCR_LANGUAGES: readonly OcrLanguageSpec[] = [
  { value: 'zh', paddle: 'ch' },
  { value: 'zh-Hant', paddle: 'chinese_cht' },
  { value: 'en', paddle: 'en' },
  { value: 'ja', paddle: 'japan' },
];

export function languageSpec(value: OcrLanguage): OcrLanguageSpec {
  return OCR_LANGUAGES.find((l) => l.value === value) ?? OCR_LANGUAGES[0];
}

const LOCALE_TO_OCR: Record<Locale, OcrLanguage> = {
  'zh-CN': 'zh',
  'zh-TW': 'zh-Hant',
  en: 'en',
  ja: 'ja',
};

export function ocrLanguageForLocale(locale: Locale): OcrLanguage {
  return LOCALE_TO_OCR[locale] ?? 'zh';
}

/** 'auto' 跟随界面语言；普通用户不需要单独选 OCR 语言 */
export function resolveOcrLanguage(
  options: Pick<ConvertOptions, 'ocrLanguage' | 'locale'>,
): OcrLanguage {
  return options.ocrLanguage === 'auto'
    ? ocrLanguageForLocale(options.locale)
    : options.ocrLanguage;
}
