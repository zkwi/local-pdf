import type { ConvertOptions, OutputFormat } from '../core/contracts/options.ts';
import type { ConversionReport, PageReport } from '../core/contracts/report.ts';
import type { Job } from '../hooks/useConversionQueue.ts';
import type { DocJob } from '../hooks/useToPdfQueue.ts';
import { SITE } from '../site.ts';
import type { Capabilities } from './capabilities.ts';
import { probeCapabilities } from './capabilities.ts';
import { formatSize } from './format.ts';
import type { ToolId } from './tools.ts';

/**
 * 反馈入口：把出错现场拼成 GitHub Issue 表单的预填链接，用户在 GitHub 上看过、改过再提交。
 * 模板文件名和字段 id 必须和 .github/ISSUE_TEMPLATE/ 下的表单一致，tests/feedback.test.ts 会核对。
 * 链接里只有版本、浏览器、错误码、设置和统计数字；文件名、密码和任何正文内容都不带。
 */
export const ISSUE_TEMPLATES = {
  bug: 'bug_report.yml',
  quality: 'conversion_quality.yml',
} as const;

/** 表单里由应用预填的字段 id */
export const ISSUE_FIELDS = ['environment', 'diagnostics'] as const;

export interface Feedback {
  readonly kind: keyof typeof ISSUE_TEMPLATES;
  readonly title: string;
  /** 工具 id；崩溃页拿不到工具时给当前路径 */
  readonly tool: string;
  readonly diagnostics: readonly string[];
}

export interface FeedbackEnvironment {
  readonly version: string;
  readonly locale: string;
  readonly userAgent: string;
  readonly caps?: Capabilities;
  /** navigator.deviceMemory，只有 Chromium 给，单位 GB */
  readonly deviceMemory?: number;
  readonly cores?: number;
}

/** GitHub 对整个 URL 有大约 8 KB 的上限；诊断信息编码后超过这个数就截断，别让链接打不开 */
const MAX_DIAGNOSTICS_BYTES = 4000;

export function feedbackUrl(feedback: Feedback, env: FeedbackEnvironment): string {
  const url = new URL(`${SITE.repo}/issues/new`);
  url.searchParams.set('template', ISSUE_TEMPLATES[feedback.kind]);
  url.searchParams.set('title', feedback.title);
  url.searchParams.set('environment', environmentText(feedback.tool, env));
  url.searchParams.set(
    'diagnostics',
    clamp(feedback.diagnostics.join('\n'), MAX_DIAGNOSTICS_BYTES),
  );
  return url.href;
}

function environmentText(tool: string, env: FeedbackEnvironment): string {
  const lines = [
    `Version: ${env.version}`,
    `Tool: ${tool}`,
    `Language: ${env.locale}`,
    `Browser: ${env.userAgent}`,
  ];
  if (env.caps !== undefined) {
    const { wasmSimd, mobile, lowMemory } = env.caps;
    lines.push(`Capabilities: wasmSimd=${wasmSimd} mobile=${mobile} lowMemory=${lowMemory}`);
  }
  const device: string[] = [];
  if (env.deviceMemory !== undefined) device.push(`${env.deviceMemory} GB memory`);
  if (env.cores !== undefined) device.push(`${env.cores} cores`);
  if (device.length > 0) lines.push(`Device: ${device.join(', ')}`);
  return lines.join('\n');
}

function clamp(text: string, maxBytes: number): string {
  const encoded = encodeURIComponent(text).length;
  if (encoded <= maxBytes) return text;
  return `${text.slice(0, Math.floor((text.length * maxBytes) / encoded))}\n…`;
}

let cachedCaps: Capabilities | undefined;

/** 点击时才收集：版本来自构建，其余都问浏览器 */
export function browserEnvironment(locale: string): FeedbackEnvironment {
  cachedCaps ??= probeCapabilities();
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    version: SITE.version,
    locale,
    userAgent: navigator.userAgent,
    caps: cachedCaps,
    deviceMemory: nav.deviceMemory,
    cores: navigator.hardwareConcurrency,
  };
}

/** PDF 队列是三个工具页共用的，按输出格式反推是哪一页 */
export function pdfToolId(output: OutputFormat): ToolId {
  if (output === 'images') return 'pdf-to-images';
  if (output === 'markdown') return 'pdf-to-markdown';
  return 'pdf-to-word';
}

/** 设置逐项列出；密码不进链接，界面语言已在环境里 */
function settingsLine(options: object): string {
  const parts = Object.entries(options)
    .filter(([key]) => key !== 'password' && key !== 'locale')
    .map(([key, value]) => `${key}=${String(value)}`);
  return `Settings: ${parts.join(' ')}`;
}

/** PDF 转换失败的现场：错误码、卡在哪一页、文件多大、用的什么设置。不带文件名 */
export function jobDiagnostics(job: Job): string[] {
  const lines: string[] = [];
  if (job.error !== undefined) {
    lines.push(`Error: ${job.error.code}`);
    if (job.error.detail !== undefined && job.error.detail !== '') {
      lines.push(`Detail: ${job.error.detail}`);
    }
  }
  const { pageIndex, totalPages, documentPages } = job.progress;
  if (pageIndex !== undefined && totalPages !== undefined) {
    lines.push(`Failed at: page ${pageIndex + 1} of ${totalPages}`);
  }
  const pages = documentPages ?? totalPages;
  lines.push(
    `File: PDF, ${formatSize(job.file.size)}${pages === undefined ? '' : `, ${pages} pages`}`,
  );
  if (job.startedAt !== undefined && job.finishedAt !== undefined) {
    lines.push(`Elapsed: ${Math.round((job.finishedAt - job.startedAt) / 1000)} s`);
  }
  lines.push(settingsLine(job.options));
  return lines;
}

/** 转换完成但结果不对：报告里的统计和警告汇总，够判断是哪类版面出了问题 */
export function reportDiagnostics(
  report: ConversionReport,
  options: ConvertOptions,
  fileSize: number,
): string[] {
  const pages = report.pages;
  const total = (pick: (page: PageReport) => number): number =>
    pages.reduce((sum, page) => sum + pick(page), 0);
  const low = pages.filter((p) => p.confidence < 0.6).map((p) => p.index + 1);
  const counts = new Map<string, number>();
  for (const w of [...report.warnings, ...pages.flatMap((p) => p.warnings)]) {
    counts.set(w.code, (counts.get(w.code) ?? 0) + 1);
  }
  const warnings = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${code} ×${n}`)
    .join(', ');
  const ocr = pages.filter((p) => p.ocrApplied).length;
  return [
    `File: PDF, ${formatSize(fileSize)}, ${report.pageCount} pages`,
    `Output: ${total((p) => p.characters)} characters, ${total((p) => p.tables)} tables, ${total((p) => p.images)} images`,
    `OCR: ${ocr} pages${report.ocrEngine === undefined ? '' : ` (${report.ocrEngine})`}`,
    `Low confidence pages: ${low.length === 0 ? 'none' : low.slice(0, 30).join(', ')}${low.length > 30 ? ', …' : ''}`,
    `Duration: ${(report.totalDurationMs / 1000).toFixed(1)} s`,
    `Warnings: ${warnings === '' ? 'none' : warnings}`,
    settingsLine(options),
  ];
}

/** Word / Markdown 转 PDF 失败的现场 */
export function docJobDiagnostics(job: DocJob): string[] {
  const lines: string[] = [];
  if (job.error !== undefined) lines.push(`Error: ${job.error}`);
  lines.push(`Source: ${job.source}`);
  const assets = job.assets.size > 0 ? `, ${job.assets.size} referenced images` : '';
  lines.push(`File: ${formatSize(job.file.size)}${assets}`);
  if (job.stage !== undefined) lines.push(`Stage: ${job.stage}`);
  lines.push(settingsLine(job.options));
  return lines;
}

/** 整页崩溃：错误和调用栈的前几行 */
export function crashDiagnostics(error: Error): string[] {
  const stack = (error.stack ?? '').split('\n').slice(0, 8);
  return [`Error: ${error.name}: ${error.message}`, ...stack];
}
