/** 给 tests/prerender.test.ts 用的类型声明；实现在同名 .mjs 里 */
export const SITE_URL: string;
export const TOOL_SLUGS: readonly string[];
export const LOCALES: readonly string[];
export function extractMessages(source: string, keys: readonly string[]): Record<string, string>;
export function loadMessages(locale: string): Record<string, string>;
export function renderToolPage(
  html: string,
  slug: string,
  messages: Record<string, Record<string, string>>,
): string;
