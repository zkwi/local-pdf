import type { ConversionMode, ConvertOptions, OcrPolicy } from '../core/contracts/options.ts';

interface OptionsPanelProps {
  readonly options: ConvertOptions;
  readonly onChange: (options: ConvertOptions) => void;
  readonly open: boolean;
  readonly onToggle: () => void;
}

const MODES: { value: ConversionMode; label: string; hint: string }[] = [
  { value: 'editable', label: '可编辑', hint: '识别段落、标题、表格、图片，生成结构化 Word' },
  { value: 'plain-text', label: '纯文本', hint: '只保留阅读顺序和文字，版面复杂时最稳' },
];

const OCR_POLICIES: { value: OcrPolicy; label: string; hint: string }[] = [
  { value: 'auto', label: '自动', hint: '只对没有文字层的页面做 OCR' },
  { value: 'off', label: '关闭', hint: '完全不做 OCR，扫描页会变成空白' },
  { value: 'force', label: '全部', hint: '每一页都 OCR，慢很多' },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'chi_sim+eng', label: '简体中文 + 英文' },
  { value: 'chi_tra+eng', label: '繁体中文 + 英文' },
  { value: 'eng', label: '仅英文' },
  { value: 'jpn+eng', label: '日文 + 英文' },
];

export function OptionsPanel({ options, onChange, open, onToggle }: OptionsPanelProps) {
  const set = <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]): void => {
    onChange({ ...options, [key]: value });
  };

  return (
    <section className="panel">
      <button className="panel__header" onClick={onToggle} aria-expanded={open} type="button">
        <span className="panel__title">转换设置</span>
        <span className="panel__summary">
          {MODES.find((m) => m.value === options.mode)?.label} · OCR{' '}
          {OCR_POLICIES.find((p) => p.value === options.ocr)?.label}
        </span>
        <span className={`panel__chevron${open ? ' panel__chevron--open' : ''}`} aria-hidden="true">
          ›
        </span>
      </button>

      {open && (
        <div className="panel__body">
          <fieldset className="field">
            <legend className="field__label">输出模式</legend>
            <div className="segmented">
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`segmented__item${options.mode === mode.value ? ' segmented__item--on' : ''}`}
                  onClick={() => set('mode', mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="field__hint">{MODES.find((m) => m.value === options.mode)?.hint}</p>
          </fieldset>

          <fieldset className="field">
            <legend className="field__label">扫描件 OCR</legend>
            <div className="segmented">
              {OCR_POLICIES.map((policy) => (
                <button
                  key={policy.value}
                  type="button"
                  className={`segmented__item${options.ocr === policy.value ? ' segmented__item--on' : ''}`}
                  onClick={() => set('ocr', policy.value)}
                >
                  {policy.label}
                </button>
              ))}
            </div>
            <p className="field__hint">{OCR_POLICIES.find((p) => p.value === options.ocr)?.hint}</p>
            {options.ocr !== 'off' && (
              <>
                <label className="field__row">
                  <span>识别语言</span>
                  <select
                    value={options.ocrLanguages}
                    onChange={(e) => set('ocrLanguages', e.target.value)}
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="field__hint field__hint--warn">
                  首次 OCR 需要下载语言包（约 15–40 MB）。只下载，不上传；离线部署请看 README 的自托管说明。
                </p>
              </>
            )}
          </fieldset>

          <fieldset className="field">
            <legend className="field__label">版面识别</legend>
            <div className="checks">
              <Toggle
                label="多栏检测"
                checked={options.detectColumns}
                onChange={(v) => set('detectColumns', v)}
              />
              <Toggle
                label="有框线表格"
                checked={options.detectTables}
                onChange={(v) => set('detectTables', v)}
              />
              <Toggle
                label="图片"
                checked={options.extractImages}
                onChange={(v) => set('extractImages', v)}
              />
              <Toggle
                label="页眉页脚"
                checked={options.detectHeaderFooter}
                onChange={(v) => set('detectHeaderFooter', v)}
              />
              <Toggle
                label="保留为 Word 页眉页脚"
                checked={options.keepHeaderFooter}
                disabled={!options.detectHeaderFooter}
                onChange={(v) => set('keepHeaderFooter', v)}
              />
            </div>
          </fieldset>

          <fieldset className="field">
            <legend className="field__label">性能</legend>
            <label className="field__row">
              <span>图片 / OCR 渲染倍率</span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.5}
                value={options.renderScale}
                onChange={(e) => set('renderScale', Number(e.target.value))}
              />
              <output>{options.renderScale}×</output>
            </label>
            <label className="field__row">
              <span>最多转换页数</span>
              <input
                type="number"
                min={1}
                max={5000}
                value={options.maxPages}
                onChange={(e) => set('maxPages', Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
          </fieldset>
        </div>
      )}
    </section>
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
