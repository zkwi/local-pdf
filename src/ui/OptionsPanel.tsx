import { useEffect, useState } from 'react';
import { DEFAULT_OPTIONS } from '../core/contracts/options.ts';
import type {
  ConversionMode,
  ConvertOptions,
  OcrLanguage,
  OcrPolicy,
  OcrQuality,
  PageImageFormat,
} from '../core/contracts/options.ts';
import { OCR_LANGUAGES, resolveOcrLanguage } from '../core/ocr/languages.ts';
import { cachedModelBytes, clearModelCache } from '../core/ocr/model-cache.ts';
import { formatMegabytes, selectPaddleModels } from '../core/ocr/paddle-models.ts';
import { isPageRangeValid } from '../core/util/page-range.ts';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';

interface OptionsPanelProps {
  readonly id: string;
  readonly options: ConvertOptions;
  readonly onChange: (options: ConvertOptions) => void;
  readonly ocrAvailable: boolean;
  /** 顺便再生成另一种格式：Word 页上是 Markdown，Markdown 页上是 Word */
  readonly also: boolean;
  readonly onAlsoChange: (value: boolean) => void;
}

/** 运行时体积（SDK Worker + ORT wasm，gzip 后）与模型之和，给"首次下载"提示用 */
const RUNTIME_BYTES = 11 * 1024 * 1024;

const OCR_POLICIES: readonly OcrPolicy[] = ['auto', 'off', 'force'];
const QUALITIES: readonly OcrQuality[] = ['fast', 'balanced'];
const MODES: readonly ConversionMode[] = ['editable', 'plain-text'];
const MODE_KEY: Record<ConversionMode, 'editable' | 'plain'> = {
  editable: 'editable',
  'plain-text': 'plain',
};
const IMAGE_FORMATS: readonly PageImageFormat[] = ['png', 'jpeg'];
const IMAGE_DPIS = ['96', '150', '300'] as const;
type ImageDpi = (typeof IMAGE_DPIS)[number];
/** A4 尺寸（pt），给"大约多少像素"的提示用 */
const A4_PT = { width: 595, height: 842 };

/**
 * "更多选项"展开后的内容，开关按钮在 App 主面板的顶栏里。默认设置已经是普通用户想要的，
 * 这里只放"结果不对时可能想调"的开关，用大白话标注，不提技术名词。
 */
export function OptionsPanel({
  id,
  options,
  onChange,
  ocrAvailable,
  also,
  onAlsoChange,
}: OptionsPanelProps) {
  const { t, locale } = useI18n();
  const set = <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]): void => {
    onChange({ ...options, [key]: value });
  };
  const selection = selectPaddleModels(
    options.ocrQuality,
    resolveOcrLanguage({ ...options, locale }),
  );
  // 输出格式由页面决定，不算改过设置
  const isDefault =
    !also &&
    JSON.stringify({ ...options, output: DEFAULT_OPTIONS.output }) ===
      JSON.stringify(DEFAULT_OPTIONS);

  return (
    <div className="advanced" id={id}>
      <div className="advanced__body">
        {options.output === 'images' ? (
          <ImageOptions options={options} set={set} />
        ) : (
          <>
            <fieldset className="field">
              <legend className="field__label">{t('output.label')}</legend>
              <div className="checks">
                <Toggle
                  label={t(
                    options.output === 'docx' ? 'advanced.also.markdown' : 'advanced.also.docx',
                  )}
                  checked={also}
                  onChange={onAlsoChange}
                />
              </div>
            </fieldset>

            <fieldset className="field">
              <legend className="field__label">{t('ocr.label')}</legend>
              {ocrAvailable ? (
                <>
                  <Segmented
                    values={OCR_POLICIES}
                    value={options.ocr}
                    label={(v) => t(`ocr.${v}` as MessageKey)}
                    hint={(v) => t(`ocr.${v}.hint` as MessageKey)}
                    onChange={(v) => set('ocr', v)}
                  />
                  {options.ocr !== 'off' && (
                    <div className="subfield">
                      <label className="field__row">
                        <span>{t('ocr.quality.label')}</span>
                        <Segmented
                          compact
                          values={QUALITIES}
                          value={options.ocrQuality}
                          label={(v) => t(`ocr.quality.${v}` as MessageKey)}
                          hint={(v) => t(`ocr.quality.${v}.hint` as MessageKey)}
                          onChange={(v) => set('ocrQuality', v)}
                        />
                      </label>
                      <label className="field__row">
                        <span>{t('ocr.language.label')}</span>
                        <select
                          value={options.ocrLanguage}
                          onChange={(e) =>
                            set('ocrLanguage', e.target.value as OcrLanguage | 'auto')
                          }
                        >
                          <option value="auto">{t('ocr.language.auto')}</option>
                          {OCR_LANGUAGES.map((lang) => (
                            <option key={lang.value} value={lang.value}>
                              {t(`ocr.language.${lang.value}` as MessageKey)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="field__hint">
                        {t(`ocr.quality.${selection.quality}.hint` as MessageKey)}{' '}
                        {t('ocr.download.hint', {
                          size: formatMegabytes(selection.totalBytes + RUNTIME_BYTES),
                        })}
                        {selection.quality !== options.ocrQuality &&
                          ` ${t('ocr.japaneseNeedsSmall')}`}
                      </p>
                      <ModelCacheStatus />
                    </div>
                  )}
                </>
              ) : (
                <p className="field__hint">{t('ocr.unavailable')}</p>
              )}
            </fieldset>

            <fieldset className="field">
              <legend className="field__label">{t('content.label')}</legend>
              <Segmented
                values={MODES}
                value={options.mode}
                label={(v) => t(`content.${MODE_KEY[v]}` as MessageKey)}
                hint={(v) => t(`content.${MODE_KEY[v]}.hint` as MessageKey)}
                onChange={(v) => set('mode', v)}
              />
            </fieldset>

            <fieldset className="field">
              <legend className="field__label">{t('layout.label')}</legend>
              <div className="checks">
                <Toggle
                  label={t('layout.columns')}
                  checked={options.detectColumns}
                  onChange={(v) => set('detectColumns', v)}
                />
                <Toggle
                  label={t('layout.tables')}
                  checked={options.detectTables}
                  onChange={(v) => set('detectTables', v)}
                />
                <Toggle
                  label={t('layout.images')}
                  checked={options.extractImages}
                  onChange={(v) => set('extractImages', v)}
                />
                <Toggle
                  label={t('layout.headerFooter')}
                  checked={options.detectHeaderFooter}
                  onChange={(v) => set('detectHeaderFooter', v)}
                />
                <Toggle
                  label={t('layout.keepHeaderFooter')}
                  checked={options.keepHeaderFooter}
                  disabled={!options.detectHeaderFooter}
                  onChange={(v) => set('keepHeaderFooter', v)}
                />
              </div>
            </fieldset>
          </>
        )}

        {!isDefault && (
          <button
            type="button"
            className="link advanced__reset"
            onClick={() => {
              onChange({ ...DEFAULT_OPTIONS, output: options.output });
              onAlsoChange(false);
            }}
          >
            {t('advanced.reset')}
          </button>
        )}
      </div>
    </div>
  );
}

interface ImageOptionsProps {
  readonly options: ConvertOptions;
  readonly set: <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) => void;
}

/** 图片模式只有格式、清晰度和页码范围三个选项；OCR、版面那些开关对它没意义，不显示 */
function ImageOptions({ options, set }: ImageOptionsProps) {
  const { t } = useI18n();
  const scale = options.pageImageDpi / 72;
  // 这里还不知道文档有几页，只查写法；超出页数的部分转换时会自动忽略
  const rangeInvalid = !isPageRangeValid(options.pageRange);
  return (
    <fieldset className="field">
      <legend className="field__label">{t('images.label')}</legend>
      <div className="subfield">
        <div className="field__row">
          <span>{t('images.format.label')}</span>
          <Segmented
            compact
            values={IMAGE_FORMATS}
            value={options.pageImageFormat}
            label={(v) => v.toUpperCase()}
            hint={(v) => t(`images.format.${v}.hint` as MessageKey)}
            onChange={(v) => set('pageImageFormat', v)}
          />
        </div>
        <div className="field__row">
          <span>{t('images.dpi.label')}</span>
          <Segmented
            compact
            values={IMAGE_DPIS}
            value={String(options.pageImageDpi) as ImageDpi}
            label={(v) => `${v} DPI`}
            hint={(v) => t(`images.dpi.${v}.hint` as MessageKey)}
            onChange={(v) => set('pageImageDpi', Number(v))}
          />
        </div>
        <p className="field__hint">
          {t(`images.format.${options.pageImageFormat}.hint` as MessageKey)}{' '}
          {t(`images.dpi.${options.pageImageDpi}.hint` as MessageKey)}{' '}
          {t('images.size.hint', {
            width: Math.round(A4_PT.width * scale),
            height: Math.round(A4_PT.height * scale),
          })}
        </p>
        <label className="field__row">
          <span>{t('images.range.label')}</span>
          <input
            type="text"
            value={options.pageRange}
            placeholder={t('images.range.placeholder')}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={rangeInvalid || undefined}
            onChange={(e) => set('pageRange', e.target.value)}
          />
        </label>
        <p className={`field__hint${rangeInvalid ? ' field__hint--warn' : ''}`}>
          {rangeInvalid ? t('images.range.invalid') : t('images.range.hint')}
        </p>
      </div>
    </fieldset>
  );
}

interface SegmentedProps<T extends string> {
  readonly values: readonly T[];
  readonly value: T;
  readonly label: (value: T) => string;
  readonly hint: (value: T) => string;
  readonly onChange: (value: T) => void;
  readonly compact?: boolean;
}

export function Segmented<T extends string>({
  values,
  value,
  label,
  hint,
  onChange,
  compact = false,
}: SegmentedProps<T>) {
  return (
    <div className={compact ? 'segmented-wrap segmented-wrap--compact' : 'segmented-wrap'}>
      <div className="segmented" role="radiogroup">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            className={`segmented__item${value === v ? ' segmented__item--on' : ''}`}
            onClick={() => onChange(v)}
            title={hint(v)}
          >
            {label(v)}
          </button>
        ))}
      </div>
      {!compact && <p className="field__hint">{hint(value)}</p>}
    </div>
  );
}

/** 已缓存的模型体积 + 清除按钮。主线程直接读 Cache Storage，不经过 Worker */
function ModelCacheStatus() {
  const { t } = useI18n();
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void cachedModelBytes().then((b) => {
      if (alive) setBytes(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (bytes === null || bytes === 0) return null;
  return (
    <p className="field__hint cache-row">
      <span>{t('ocr.cache.status', { size: formatMegabytes(bytes) })}</span>
      <button
        type="button"
        className="link"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void clearModelCache().then(() => {
            setBytes(0);
            setBusy(false);
          });
        }}
      >
        {t('ocr.cache.clear')}
      </button>
    </p>
  );
}

interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: boolean) => void;
}

function Toggle({ label, checked, disabled = false, onChange }: ToggleProps) {
  return (
    <label className={`check${disabled ? ' check--disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
