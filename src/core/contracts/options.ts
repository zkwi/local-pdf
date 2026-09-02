/** 输出模式，对应 docs/QUALITY_LEVELS.md */
export type ConversionMode = 'editable' | 'plain-text';

export type OcrPolicy = 'off' | 'auto' | 'force';

/** fast：PP-OCRv6 tiny（约 6 MB）；balanced：PP-OCRv6 small（约 30 MB） */
export type OcrQuality = 'fast' | 'balanced';

export type OcrLanguage = 'zh' | 'zh-Hant' | 'en' | 'ja';

export type OutputFormat = 'docx' | 'markdown' | 'both';

/** 界面语言；核心层只用它决定输出文件里少数几处可读文案（如图片替代文本） */
export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja';

export interface ConvertOptions {
  readonly locale: Locale;
  readonly mode: ConversionMode;
  readonly output: OutputFormat;
  readonly ocr: OcrPolicy;
  readonly ocrQuality: OcrQuality;
  /** 'auto' 表示跟随界面语言 */
  readonly ocrLanguage: OcrLanguage | 'auto';
  readonly detectTables: boolean;
  /** 无框线表格识别（误判风险更高，默认关） */
  readonly detectBorderlessTables: boolean;
  readonly extractImages: boolean;
  readonly detectHeaderFooter: boolean;
  /** 保留页眉页脚为 Word 页眉页脚（否则丢弃） */
  readonly keepHeaderFooter: boolean;
  readonly detectColumns: boolean;
  /** 图片渲染倍率；OCR 时至少按 3 倍（约 216 DPI）渲染 */
  readonly renderScale: number;
  readonly maxPages: number;
  readonly password?: string;
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  locale: 'zh-CN',
  mode: 'editable',
  output: 'docx',
  ocr: 'auto',
  ocrQuality: 'fast',
  ocrLanguage: 'auto',
  detectTables: true,
  detectBorderlessTables: false,
  extractImages: true,
  detectHeaderFooter: true,
  keepHeaderFooter: true,
  detectColumns: true,
  renderScale: 2,
  maxPages: 1000,
};
