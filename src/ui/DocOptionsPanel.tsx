import type { CjkFont } from '../core/pdfgen/fonts.ts';
import type { DocMargin } from '../core/pdfgen/markdown.ts';
import { DEFAULT_DOC_OPTIONS } from '../hooks/useToPdfQueue.ts';
import type { DocPdfOptions, DocSource } from '../hooks/useToPdfQueue.ts';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';
import { Segmented } from './OptionsPanel.tsx';
import type { CjkChoice } from './tools/DocToPdfTool.tsx';

const PAGES: readonly ('a4' | 'letter')[] = ['a4', 'letter'];
const MARGINS: readonly DocMargin[] = ['narrow', 'normal', 'wide'];
const FONT_SIZES = ['10', '11', '12'] as const;
type FontSize = (typeof FONT_SIZES)[number];
const CJK: readonly CjkChoice[] = ['auto', 'zh-CN', 'zh-TW', 'ja', 'ko'];

interface DocOptionsPanelProps {
  readonly source: DocSource;
  readonly options: DocPdfOptions;
  readonly onChange: (options: DocPdfOptions) => void;
  readonly cjk: CjkChoice;
  readonly onCjkChange: (cjk: CjkChoice) => void;
}

/** Word / Markdown 转 PDF 的"更多选项"：Markdown 多一组纸张设置，Word 沿用文档自己的 */
export function DocOptionsPanel({
  source,
  options,
  onChange,
  cjk,
  onCjkChange,
}: DocOptionsPanelProps) {
  const { t } = useI18n();
  const set = <K extends keyof DocPdfOptions>(key: K, value: DocPdfOptions[K]): void => {
    onChange({ ...options, [key]: value });
  };
  const isDefault =
    cjk === 'auto' &&
    JSON.stringify({ ...options, cjk: DEFAULT_DOC_OPTIONS.cjk }) ===
      JSON.stringify(DEFAULT_DOC_OPTIONS);

  return (
    <div className="advanced" id="advanced-panel">
      <div className="advanced__body">
        {source === 'markdown' ? (
          <fieldset className="field">
            <legend className="field__label">{t('docpdf.page.label')}</legend>
            <div className="subfield">
              <div className="field__row">
                <span>{t('docpdf.page.label')}</span>
                <Segmented
                  compact
                  values={PAGES}
                  value={options.pageSize}
                  label={(v) => t(`docpdf.page.${v}` as MessageKey)}
                  hint={(v) => t(`docpdf.page.${v}` as MessageKey)}
                  onChange={(v) => set('pageSize', v)}
                />
              </div>
              <div className="field__row">
                <span>{t('docpdf.margin.label')}</span>
                <Segmented
                  compact
                  values={MARGINS}
                  value={options.margin}
                  label={(v) => t(`docpdf.margin.${v}` as MessageKey)}
                  hint={(v) => t(`docpdf.margin.${v}` as MessageKey)}
                  onChange={(v) => set('margin', v)}
                />
              </div>
              <div className="field__row">
                <span>{t('docpdf.fontSize.label')}</span>
                <Segmented
                  compact
                  values={FONT_SIZES}
                  value={String(options.fontSize) as FontSize}
                  label={(v) => `${v} pt`}
                  hint={(v) => `${v} pt`}
                  onChange={(v) => set('fontSize', Number(v))}
                />
              </div>
            </div>
          </fieldset>
        ) : (
          <p className="field__hint">{t('docpdf.word.hint')}</p>
        )}

        <fieldset className="field">
          <legend className="field__label">{t('docpdf.cjk.label')}</legend>
          <label className="field__row">
            <span>{t('docpdf.cjk.label')}</span>
            <select value={cjk} onChange={(e) => onCjkChange(e.target.value as CjkChoice)}>
              {CJK.map((value) => (
                <option key={value} value={value}>
                  {t(`docpdf.cjk.${value}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <p className="field__hint">{t('docpdf.cjk.hint')}</p>
        </fieldset>

        {!isDefault && (
          <button
            type="button"
            className="link advanced__reset"
            onClick={() => {
              onChange(DEFAULT_DOC_OPTIONS);
              onCjkChange('auto');
            }}
          >
            {t('advanced.reset')}
          </button>
        )}
      </div>
    </div>
  );
}

export type { CjkFont };
