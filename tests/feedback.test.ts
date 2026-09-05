import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ConversionWarning } from '../src/core/contracts/layout.ts';
import { DEFAULT_OPTIONS } from '../src/core/contracts/options.ts';
import type { ConversionReport, PageReport } from '../src/core/contracts/report.ts';
import type { Job } from '../src/hooks/useConversionQueue.ts';
import {
  ISSUE_FIELDS,
  ISSUE_TEMPLATES,
  crashDiagnostics,
  feedbackUrl,
  jobDiagnostics,
  pdfToolId,
  reportDiagnostics,
} from '../src/ui/feedback.ts';
import type { FeedbackEnvironment } from '../src/ui/feedback.ts';

const env: FeedbackEnvironment = {
  version: '0.6.0',
  locale: 'zh-CN',
  userAgent: 'TestBrowser/1.0',
  caps: {
    worker: true,
    wasm: true,
    wasmSimd: true,
    offscreenCanvas: true,
    imageBitmap: true,
    mobile: false,
    lowMemory: false,
  },
  deviceMemory: 8,
  cores: 12,
};

/** 这两样绝不能出现在链接里 */
const SECRET_NAME = '合同-绝密.pdf';
const SECRET_PASSWORD = 'hunter2';

const failedJob: Job = {
  id: 'j1',
  file: new File(['%PDF-1.4'], SECRET_NAME, { type: 'application/pdf' }),
  options: { ...DEFAULT_OPTIONS, password: SECRET_PASSWORD },
  status: 'error',
  progress: {
    stage: 'failed',
    fraction: 0,
    key: 'failed',
    pageIndex: 3,
    totalPages: 12,
    documentPages: 12,
  },
  startedAt: 1_000,
  finishedAt: 31_000,
  samples: [],
  ocrPages: 0,
  error: { code: 'out-of-memory' },
};

const page = (
  index: number,
  confidence: number,
  warnings: readonly ConversionWarning[],
): PageReport => ({
  index,
  confidence,
  columnCount: 1,
  paragraphs: 4,
  headings: 1,
  listItems: 0,
  tables: index === 1 ? 1 : 0,
  images: 0,
  characters: 500,
  ocrApplied: warnings.some((w) => w.code === 'ocr-applied'),
  warnings,
});

const report: ConversionReport = {
  fileName: SECRET_NAME,
  pageCount: 3,
  pages: [
    page(0, 0.9, [{ code: 'ocr-applied' }]),
    page(1, 0.5, [{ code: 'ocr-applied' }, { code: 'low-confidence-table' }]),
    page(2, 0.95, []),
  ],
  warnings: [],
  durationByStage: {},
  totalDurationMs: 12_345,
  ocrEngine: 'PP-OCRv6 tiny',
};

const param = (url: string, name: string): string => new URL(url).searchParams.get(name) ?? '';

describe('Issue 模板', () => {
  it('应用引用的模板文件存在，且带有要预填的字段', () => {
    for (const name of Object.values(ISSUE_TEMPLATES)) {
      const yaml = readFileSync(
        new URL(`../.github/ISSUE_TEMPLATE/${name}`, import.meta.url),
        'utf-8',
      );
      for (const field of ISSUE_FIELDS) expect(yaml, name).toContain(`id: ${field}`);
    }
  });
});

describe('反馈链接', () => {
  it('失败任务：带版本、工具、浏览器、错误码和设置；不带文件名和密码', () => {
    const url = feedbackUrl(
      {
        kind: 'bug',
        title: 'pdf-to-word: conversion failed (out-of-memory)',
        tool: pdfToolId(failedJob.options.output),
        diagnostics: jobDiagnostics(failedJob),
      },
      env,
    );
    expect(url.startsWith('https://github.com/zkwi/local-pdf/issues/new?')).toBe(true);
    expect(param(url, 'template')).toBe('bug_report.yml');
    expect(param(url, 'title')).toBe('pdf-to-word: conversion failed (out-of-memory)');

    const environment = param(url, 'environment');
    expect(environment).toContain('Version: 0.6.0');
    expect(environment).toContain('Tool: pdf-to-word');
    expect(environment).toContain('Browser: TestBrowser/1.0');
    expect(environment).toContain('wasmSimd=true');
    expect(environment).toContain('8 GB memory, 12 cores');

    const diagnostics = param(url, 'diagnostics');
    expect(diagnostics).toContain('Error: out-of-memory');
    expect(diagnostics).toContain('Failed at: page 4 of 12');
    expect(diagnostics).toContain('File: PDF, 8 B, 12 pages');
    expect(diagnostics).toContain('Elapsed: 30 s');
    expect(diagnostics).toContain('output=docx');
    expect(diagnostics).not.toContain('password');
    expect(diagnostics).not.toContain('locale=');

    const decoded = decodeURIComponent(url);
    expect(decoded).not.toContain(SECRET_NAME);
    expect(decoded).not.toContain('绝密');
    expect(decoded).not.toContain(SECRET_PASSWORD);
  });

  it('转换报告：统计、低置信度页和按次数排序的警告汇总', () => {
    const url = feedbackUrl(
      {
        kind: 'quality',
        title: 'pdf-to-word: output quality',
        tool: 'pdf-to-word',
        diagnostics: reportDiagnostics(report, DEFAULT_OPTIONS, 2048),
      },
      env,
    );
    expect(param(url, 'template')).toBe('conversion_quality.yml');
    const diagnostics = param(url, 'diagnostics');
    expect(diagnostics).toContain('File: PDF, 2 KB, 3 pages');
    expect(diagnostics).toContain('Output: 1500 characters, 1 tables, 0 images');
    expect(diagnostics).toContain('OCR: 2 pages (PP-OCRv6 tiny)');
    expect(diagnostics).toContain('Low confidence pages: 2');
    expect(diagnostics).toContain('Duration: 12.3 s');
    expect(diagnostics).toContain('Warnings: ocr-applied ×2, low-confidence-table ×1');
    expect(decodeURIComponent(url)).not.toContain(SECRET_NAME);
  });

  it('工具页按输出格式反推', () => {
    expect(pdfToolId('docx')).toBe('pdf-to-word');
    expect(pdfToolId('both')).toBe('pdf-to-word');
    expect(pdfToolId('markdown')).toBe('pdf-to-markdown');
    expect(pdfToolId('images')).toBe('pdf-to-images');
  });

  it('崩溃：错误和调用栈前几行', () => {
    const lines = crashDiagnostics(new TypeError('x is not a function'));
    expect(lines[0]).toBe('Error: TypeError: x is not a function');
    expect(lines.length).toBeLessThanOrEqual(9);
  });

  it('诊断信息太长就截断，整个链接不超过 GitHub 的上限', () => {
    const url = feedbackUrl(
      {
        kind: 'bug',
        title: 'long',
        tool: 'pdf-to-word',
        diagnostics: Array.from({ length: 400 }, (_, i) => `line ${i} 中文内容 ${'x'.repeat(40)}`),
      },
      env,
    );
    expect(url.length).toBeLessThan(8000);
    expect(param(url, 'diagnostics')).toContain('…');
  });
});
