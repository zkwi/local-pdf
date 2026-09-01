/** 输出模式，对应 docs/QUALITY_LEVELS.md */
export type ConversionMode = 'editable' | 'plain-text';

export type OcrPolicy = 'off' | 'auto' | 'force';

export interface ConvertOptions {
  readonly mode: ConversionMode;
  readonly ocr: OcrPolicy;
  /** tesseract 语言串，如 'chi_sim+eng' */
  readonly ocrLanguages: string;
  /** OCR 资源基地址；留空则用 tesseract.js 默认 CDN */
  readonly ocrAssetBase: string;
  readonly detectTables: boolean;
  /** 无框线表格识别（误判风险更高，默认关） */
  readonly detectBorderlessTables: boolean;
  readonly extractImages: boolean;
  readonly detectHeaderFooter: boolean;
  /** 保留页眉页脚为 Word 页眉页脚（否则丢弃） */
  readonly keepHeaderFooter: boolean;
  readonly detectColumns: boolean;
  /** 图片/OCR 渲染倍率 */
  readonly renderScale: number;
  readonly maxPages: number;
  readonly password?: string;
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  mode: 'editable',
  ocr: 'auto',
  ocrLanguages: 'chi_sim+eng',
  ocrAssetBase: '',
  detectTables: true,
  detectBorderlessTables: false,
  extractImages: true,
  detectHeaderFooter: true,
  keepHeaderFooter: true,
  detectColumns: true,
  renderScale: 2,
  maxPages: 500,
};
