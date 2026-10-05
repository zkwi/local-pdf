import { useState } from 'react';
import { clampInt } from '../core/util/number.ts';

interface NumberFieldProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  /** datalist 的 id：给几个常用值做下拉建议 */
  readonly list?: string;
  readonly onCommit: (value: number) => void;
}

/**
 * 数字输入：边输入边生效，但只接受范围内的值；离开输入框或按回车时再把越界的值收回范围。
 * 直接在 onChange 里夹取的话，想输 200 时敲下的「2」会立刻被改成下限 10。
 */
export function NumberField({ value, min, max, label, list, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = (): void => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(clampInt(n, min, max, value));
    setDraft(null);
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      list={list}
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) {
          onCommit(Math.round(n));
        }
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
