import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useI18n } from '../../i18n/index.tsx';
import { formatSize } from '../format.ts';

export interface CompareSide {
  readonly url: string;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
  readonly label: string;
}

interface CompareDialogProps {
  readonly name: string;
  readonly original: CompareSide;
  readonly result: CompareSide;
  readonly onClose: () => void;
}

/**
 * 原图和结果叠在一起，拖动分隔线左右对比；裁切或留边改了宽高比时并排显示。
 * 「实际像素」按屏幕物理像素 1:1 显示结果，看得清压缩痕迹。
 */
export function CompareDialog({ name, original, result, onClose }: CompareDialogProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [split, setSplit] = useState(50);
  const [actual, setActual] = useState(false);

  // 关按钮、点遮罩、按 Esc 都直接通知父组件卸载；close 事件只兜底（页面在后台时它可能迟迟不来）
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismiss = (): void => {
    ref.current?.close();
    closeRef.current();
  };
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    const handle = (): void => closeRef.current();
    dialog.addEventListener('close', handle);
    if (!dialog.open) dialog.showModal();
    return () => dialog.removeEventListener('close', handle);
  }, []);

  const ratio = (side: CompareSide): number | null =>
    side.width !== undefined && side.height !== undefined && side.height > 0
      ? side.width / side.height
      : null;
  const a = ratio(original);
  const b = ratio(result);
  const overlay = a !== null && b !== null && Math.abs(a / b - 1) < 0.01;
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const frameStyle: CSSProperties | undefined =
    actual && result.width !== undefined && result.height !== undefined
      ? { width: result.width / dpr, height: result.height / dpr }
      : b !== null
        ? ({ '--ratio': b } as CSSProperties)
        : undefined;
  const change = original.size > 0 ? Math.round((1 - result.size / original.size) * 100) : 0;
  const describe = (side: CompareSide): string =>
    [
      side.label,
      side.width !== undefined && side.height !== undefined
        ? `${side.width} × ${side.height}`
        : null,
      formatSize(side.size),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <dialog
      ref={ref}
      className="compare"
      aria-labelledby="compare-title"
      onClick={(e) => {
        // 点到对话框外面的遮罩就关
        if (e.target === e.currentTarget) dismiss();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          dismiss();
        }
      }}
    >
      <div className="compare__box">
        <header className="compare__head">
          <h2 id="compare-title" className="compare__title" title={name}>
            {name}
          </h2>
          <label className="check compare__actual">
            <input type="checkbox" checked={actual} onChange={(e) => setActual(e.target.checked)} />
            <span>{t('img.compare.actual')}</span>
          </label>
          <button
            type="button"
            className="btn btn--icon"
            aria-label={t('img.compare.close')}
            title={t('img.compare.close')}
            onClick={dismiss}
          >
            ×
          </button>
        </header>

        <div className={`compare__stage${actual ? ' compare__stage--actual' : ''}`}>
          {overlay ? (
            <div className="compare__frame" style={frameStyle}>
              <img className="compare__img" src={original.url} alt={original.label} />
              <img
                className="compare__img"
                src={result.url}
                alt={result.label}
                style={{ clipPath: `inset(0 0 0 ${split}%)` }}
              />
              <span className="compare__divider" style={{ left: `${split}%` }} aria-hidden="true" />
              <span className="compare__tag compare__tag--left" aria-hidden="true">
                {original.label}
              </span>
              <span className="compare__tag compare__tag--right" aria-hidden="true">
                {result.label}
              </span>
              <input
                type="range"
                className="compare__range"
                min={0}
                max={100}
                step={0.5}
                value={split}
                aria-label={t('img.compare.slider')}
                onChange={(e) => setSplit(Number(e.target.value))}
              />
            </div>
          ) : (
            <div className="compare__pair">
              {[original, result].map((side) => (
                <figure key={side.label} className="compare__side">
                  <img src={side.url} alt={side.label} />
                  <figcaption>{side.label}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <footer className="compare__foot">
          <span>{describe(original)}</span>
          <span>
            {describe(result)}
            {change !== 0 && (
              <b className={change > 0 ? 'saving' : 'saving saving--worse'}>
                {' '}
                {change > 0 ? `−${change}%` : `+${-change}%`}
              </b>
            )}
          </span>
        </footer>
        {overlay && <p className="compare__hint">{t('img.compare.hint')}</p>}
      </div>
    </dialog>
  );
}
