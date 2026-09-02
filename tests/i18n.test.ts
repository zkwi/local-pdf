import { describe, expect, it } from 'vitest';
import { interpolate } from '../src/i18n/index.tsx';
import { en } from '../src/i18n/messages/en.ts';
import { ja } from '../src/i18n/messages/ja.ts';
import { zhCN } from '../src/i18n/messages/zh-CN.ts';
import type { MessageKey } from '../src/i18n/messages/zh-CN.ts';
import { zhTW } from '../src/i18n/messages/zh-TW.ts';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n 文案表', () => {
  it('每种语言的占位符都和简中一致', () => {
    for (const [name, table] of Object.entries({ en, ja, zhTW })) {
      for (const key of Object.keys(zhCN) as MessageKey[]) {
        expect(placeholders(table[key]), `${name}.${key}`).toEqual(placeholders(zhCN[key]));
      }
    }
  });

  it('没有空文案', () => {
    for (const table of [zhCN, en, ja, zhTW]) {
      for (const value of Object.values(table)) expect(value.trim()).not.toBe('');
    }
  });

  it('每个警告码和进度键都有文案', () => {
    const codes = [
      'page-extract-failed',
      'page-render-failed',
      'page-render-downscaled',
      'image-extract-failed',
      'operator-list-failed',
      'low-confidence-reading-order',
      'low-confidence-table',
      'ocr-applied',
      'ocr-failed',
      'ocr-skipped',
      'ocr-sparse-kept-image',
      'ocr-model-unverified',
      'markdown-table-html',
      'rotated-text-flattened',
      'vertical-text-flattened',
      'page-limit-exceeded',
      'image-budget-exceeded',
      'scan-text-layer',
      'page-size-clamped',
      'no-text-found',
    ];
    for (const code of codes) expect(zhCN).toHaveProperty(`warning.${code}`);
    for (const key of [
      'loading',
      'extracting',
      'ocr-model-download',
      'rendering',
      'ocr',
      'writing-docx',
      'writing-images',
      'completed',
    ]) {
      expect(zhCN).toHaveProperty(`progress.${key}`);
    }
  });
});

describe('interpolate', () => {
  it('替换占位符，缺参数时原样保留', () => {
    expect(interpolate('第 {page} / {total} 页', { page: 2, total: 9 })).toBe('第 2 / 9 页');
    expect(interpolate('{a} {b}', { a: 'x' })).toBe('x {b}');
    expect(interpolate('无占位', undefined)).toBe('无占位');
  });
});
