import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/messages/en.ts';
import { ja } from '../src/i18n/messages/ja.ts';
import { zhCN } from '../src/i18n/messages/zh-CN.ts';
import { zhTW } from '../src/i18n/messages/zh-TW.ts';
import {
  LOCALES,
  TOOL_SLUGS,
  extractMessages,
  loadMessages,
  renderToolPage,
} from '../scripts/prerender-tools.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const tables = { en, 'zh-CN': zhCN, 'zh-TW': zhTW, ja } as const;
const messages = Object.fromEntries(LOCALES.map((locale) => [locale, loadMessages(locale)]));

describe('工具页静态 HTML', () => {
  it('从文案表源码读出的值和真正的表一致', () => {
    for (const locale of LOCALES) {
      const table = tables[locale as keyof typeof tables] as Record<string, string>;
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value, `${locale}.${key}`).toBe(table[key]);
      }
    }
  });

  it('能处理换行、双引号和转义引号', () => {
    const source = `
  'a.one': 'plain',
  'a.two':
    "with 'single' quotes",
  'a.three': 'it\\'s escaped',
`;
    expect(extractMessages(source, ['a.one', 'a.two', 'a.three'])).toEqual({
      'a.one': 'plain',
      'a.two': "with 'single' quotes",
      'a.three': "it's escaped",
    });
  });

  it('每个工具页有自己的标题、描述、canonical、hreflang、h1 和启动脚本标题', () => {
    for (const slug of TOOL_SLUGS) {
      const page = renderToolPage(html, slug, messages);
      const toolTitle = en[`tool.${slug}.title` as keyof typeof en];
      const title = en['tool.docTitle'].replace('{tool}', toolTitle);
      const description = `${en[`tool.${slug}.lede` as keyof typeof en]} ${en['meta.suffix']}`;
      expect(page).toContain(`<title>${title}</title>`);
      expect(page).toContain(`content="${description}"`);
      expect(page).toContain(
        `<link rel="canonical" href="https://localpdfconverter.com/${slug}" />`,
      );
      expect(page).toContain(`hreflang="x-default" href="https://localpdfconverter.com/${slug}"`);
      expect(page).toContain(
        `hreflang="zh-Hans" href="https://localpdfconverter.com/${slug}?lang=zh-CN"`,
      );
      expect(page).toContain(
        `<meta property="og:url" content="https://localpdfconverter.com/${slug}" />`,
      );
      expect(page).toContain(`<h1>${toolTitle}</h1>`);
      for (const locale of ['zh-CN', 'zh-TW', 'ja'] as const) {
        const table = tables[locale];
        const localTitle = table['tool.docTitle'].replace(
          '{tool}',
          table[`tool.${slug}.title` as keyof typeof table],
        );
        expect(page, `${slug} ${locale}`).toContain(`'${localTitle}'`);
      }
      // 首页专属的标题不能残留
      expect(page).not.toContain(en['app.docTitle']);
      expect(page).not.toContain(zhCN['app.docTitle']);
    }
  });
});
