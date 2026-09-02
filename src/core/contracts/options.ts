/** 输出模式，对应 docs/QUALITY_LEVELS.md */
export type ConversionMode = 'editable' | 'plain-text';

export type OcrPolicy = 'off' | 'auto' | 'force';

/** fast：PP-OCRv6 tiny（约 6 MB）；balanced：PP-OCRv6 small（约 30 MB） */
export type OcrQuality = 'fast' | 'balanced';

export type OcrLanguage = 'zh' | 'zh-Hant' | 'en' | 'ja';

/** images：每页渲染成一张图片，不走文字抽取和版面分析 */
export type OutputFormat = 'docx' | 'markdown' | 'both' | 'images';

export type PageImageFormat = 'png' | 'jpeg';

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
  /** 只在 output 为 images 时用：整页图片的格式与清晰度 */
  readonly pageImageFormat: PageImageFormat;
  readonly pageImageDpi: number;
  /**
   * 只转这些页，写法见 core/util/page-range.ts（"1-3, 5, 8-"）；空串表示全部页。
   * 目前只有 images 输出用它，Word / Markdown 仍按整份文档转。
   */
  readonly pageRange: string;
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
  pageImageFormat: 'png',
  pageImageDpi: 150,
  pageRange: '',
};
