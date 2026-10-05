import { useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/index.tsx';
import {
  changedFromDefaults,
  COMPRESS_OUTPUTS,
  CONVERT_OUTPUTS,
  DPIS,
  FITS,
  IMAGE_DEFAULTS,
  LEVELS,
  moreChanged,
  QUALITIES,
  RESIZES,
  SIZE_PRESETS,
  TARGET_KB,
} from '../image-settings.ts';
import type { CompressLevel, DpiValue, ImageSettings } from '../image-settings.ts';
import { NumberField } from '../NumberField.tsx';
import { Segmented } from '../OptionsPanel.tsx';
import { PanelMore } from '../PanelMore.tsx';
import type { ImageToolId } from '../tools.ts';

interface ImageOptionsProps {
  readonly tool: ImageToolId;
  readonly settings: ImageSettings;
  readonly onChange: (change: Partial<ImageSettings>) => void;
  /** 浏览器能编码 WebP；不能的话不给这个选项 */
  readonly webp: boolean;
}

/**
 * 图片工具的设置栏：一项核心设置在左，「更多选项」在右（和 PDF 工具的设置栏同一个样子），
 * 下面一句说明；展开后只多一行设置。哪一项放哪里见 image-settings.ts。
 */
export function ImageOptions({ tool, settings, onChange, webp }: ImageOptionsProps) {
  const { t } = useI18n();
  // 上次改过收起的那一项，打开页面时直接展开，免得设置藏着
  const [open, setOpen] = useState(() => moreChanged(settings, tool));
  const moreId = `${tool}-more`;
  const changed = changedFromDefaults(settings, tool);

  const outputs = (tool === 'convert-images' ? CONVERT_OUTPUTS : COMPRESS_OUTPUTS).filter(
    (v) => webp || v !== 'webp',
  );
  const output = !webp && settings.output === 'webp' ? outputs[0] : settings.output;
  const outputSegments = (
    <Segmented
      compact
      values={outputs}
      value={output}
      label={(v) => t(`img.output.${v}`)}
      hint={(v) => t(`img.output.${v}.hint`)}
      onChange={(v) => onChange({ output: v })}
    />
  );
  const reset = changed && (
    <>
      {' '}
      <button type="button" className="link" onClick={() => onChange(IMAGE_DEFAULTS[tool])}>
        {t('advanced.reset')}
      </button>
    </>
  );

  let main: ReactNode;
  let mainHint: string;
  let more: ReactNode;
  let moreHint: string;
  switch (tool) {
    case 'compress-images': {
      const level: CompressLevel = settings.target ? 'target' : settings.quality;
      main = (
        <>
          <span className="imgopts__label">{t('img.quality.label')}</span>
          <Segmented
            compact
            values={LEVELS}
            value={level}
            label={(v) => t(v === 'target' ? 'img.quality.custom' : `img.quality.${v}`)}
            hint={(v) => t(v === 'target' ? 'img.quality.target' : `img.quality.${v}.hint`)}
            onChange={(v) =>
              onChange(v === 'target' ? { target: true } : { quality: v, target: false })
            }
          />
          {settings.target && (
            <span className="unit-input">
              <NumberField
                min={TARGET_KB.min}
                max={TARGET_KB.max}
                value={settings.targetKb}
                label={t('img.target.value')}
                onCommit={(v) => onChange({ targetKb: v })}
              />
              <span>KB</span>
            </span>
          )}
        </>
      );
      mainHint = settings.target
        ? t('img.quality.target')
        : t(`img.quality.${settings.quality}.hint`);
      more = (
        <div className="field__row">
          <span>{t('img.output.label')}</span>
          {outputSegments}
        </div>
      );
      moreHint = t(`img.output.${output}.hint`);
      break;
    }
    case 'convert-images':
      main = (
        <>
          <span className="imgopts__label">{t('img.convert.label')}</span>
          {outputSegments}
          {output === 'jpeg' && (
            <label className="swatch-field">
              <span>{t('img.fill.label')}</span>
              <span className="swatch">
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                />
              </span>
            </label>
          )}
        </>
      );
      mainHint = t(`img.output.${output}.hint`);
      more = (
        <div className="field__row">
          <span>{t('img.quality.label')}</span>
          <Segmented
            compact
            values={QUALITIES}
            value={settings.quality}
            label={(v) => t(`img.quality.${v}`)}
            hint={(v) => t(`img.quality.${v}.hint`)}
            onChange={(v) => onChange({ quality: v })}
          />
        </div>
      );
      moreHint = t(`img.quality.${settings.quality}.hint`);
      break;
    case 'resize-images': {
      const sided =
        settings.resize === 'long' || settings.resize === 'width' || settings.resize === 'height';
      main = (
        <>
          <span className="imgopts__label">{t('img.resize.label')}</span>
          <select
            value={settings.resize}
            aria-label={t('img.resize.label')}
            onChange={(e) => onChange({ resize: e.target.value as ImageSettings['resize'] })}
          >
            {RESIZES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`img.resize.${mode}`)}
              </option>
            ))}
          </select>
          {sided && (
            <span className="unit-input">
              <NumberField
                min={16}
                max={16384}
                list={`${tool}-sizes`}
                value={settings.size}
                label={t(`img.resize.${settings.resize}`)}
                onCommit={(v) => onChange({ size: v })}
              />
              <span>px</span>
              <datalist id={`${tool}-sizes`}>
                {SIZE_PRESETS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </span>
          )}
          {settings.resize === 'percent' && (
            <span className="unit-input">
              <NumberField
                min={1}
                max={100}
                value={settings.percent}
                label={t('img.resize.percent')}
                onCommit={(v) => onChange({ percent: v })}
              />
              <span>%</span>
            </span>
          )}
          {settings.resize === 'exact' && (
            <>
              <span className="unit-input">
                <NumberField
                  min={1}
                  max={16384}
                  value={settings.exactWidth}
                  label={t('img.resize.exactWidth')}
                  onCommit={(v) => onChange({ exactWidth: v })}
                />
                <span>×</span>
                <NumberField
                  min={1}
                  max={16384}
                  value={settings.exactHeight}
                  label={t('img.resize.exactHeight')}
                  onCommit={(v) => onChange({ exactHeight: v })}
                />
                <span>px</span>
              </span>
              <Segmented
                compact
                values={FITS}
                value={settings.fit}
                label={(v) => t(`img.fit.${v}`)}
                hint={(v) => t(`img.fit.${v}.hint`)}
                onChange={(v) => onChange({ fit: v })}
              />
            </>
          )}
        </>
      );
      mainHint =
        settings.resize === 'exact'
          ? t(`img.fit.${settings.fit}.hint`)
          : t(`img.resize.${settings.resize}.hint`);
      more = (
        <div className="field__row">
          <span>{t('img.dpi.label')}</span>
          <Segmented
            compact
            values={DPIS}
            value={String(settings.dpi) as DpiValue}
            label={(v) => (v === '0' ? t('img.dpi.none') : v)}
            hint={() => t('img.dpi.hint')}
            onChange={(v) => onChange({ dpi: Number(v) })}
          />
        </div>
      );
      moreHint = t('img.dpi.hint');
      break;
    }
  }

  return (
    <>
      <div className="panel__bar imgopts" role="group" aria-label={t('img.settings')}>
        <div className="imgopts__main">{main}</div>
        <PanelMore
          open={open}
          changed={moreChanged(settings, tool)}
          controls={moreId}
          onToggle={() => setOpen((v) => !v)}
        />
      </div>
      <p className="panel__hint">
        {mainHint}
        {!open && reset}
      </p>
      {open && (
        <div className="advanced imgopts__more" id={moreId}>
          {more}
          <p className="field__hint">
            {moreHint}
            {reset}
          </p>
        </div>
      )}
    </>
  );
}
