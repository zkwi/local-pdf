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

  it('按选项拼出来的文案键都在（这些地方用了类型断言，编译器查不到）', () => {
    const keys = [
      ...['fit', 'a4', 'letter'].flatMap((v) => [
        `compose.pageSize.${v}`,
        `compose.pageSize.${v}.hint`,
      ]),
      ...['auto', 'portrait', 'landscape'].map((v) => `compose.orientation.${v}`),
      ...['none', 'small', 'normal'].map((v) => `compose.margin.${v}`),
      ...['auto', 'lossless', 'compact'].flatMap((v) => [
        `compose.quality.${v}`,
        `compose.quality.${v}.hint`,
      ]),
      ...['word', 'markdown', 'images', 'compress', 'convert', 'resize'].map((v) => `nav.${v}`),
      ...['local', 'editable', 'ocr', 'free', 'vector', 'compose', 'shrink', 'batch'].flatMap(
        (v) => [`features.${v}.title`, `features.${v}.body`],
      ),
      ...[1, 2, 3].flatMap((i) => [`seo.how.${i}`, `seo.how.topdf.${i}`, `seo.how.image.${i}`]),
      ...[1, 2, 3, 4, 5, 6].flatMap((i) => [
        `seo.faq.q${i}`,
        `seo.faq.a${i}`,
        `seo.faq.image.q${i}`,
        `seo.faq.image.a${i}`,
      ]),
    ];
    for (const table of [zhCN, en, ja, zhTW]) {
      for (const key of keys) expect(Object.hasOwn(table, key), key).toBe(true);
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
