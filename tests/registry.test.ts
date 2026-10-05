import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOL_SLUGS } from '../scripts/prerender-tools.mjs';
import { en } from '../src/i18n/messages/en.ts';
import { ja } from '../src/i18n/messages/ja.ts';
import { zhCN } from '../src/i18n/messages/zh-CN.ts';
import { zhTW } from '../src/i18n/messages/zh-TW.ts';
import { TOOLS } from '../src/ui/tools.ts';

/**
 * 工具清单在好几处各抄了一份：工具注册表、构建时生成静态页的列表、sitemap、index.html 里给爬虫看的链接。
 * 加工具时漏改一处，页面照样能用，只是搜索引擎看不到——这里统一核对，漏了就失败。
 */
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf-8');
const slugs = TOOLS.map((tool) => tool.slug).filter((slug) => slug !== '');

describe('工具清单各处一致', () => {
  it('构建时生成静态页的列表 = 工具注册表（首页除外）', () => {
    expect([...TOOL_SLUGS].sort()).toEqual([...slugs].sort());
  });

  it('sitemap 收录每个工具页', () => {
    const sitemap = read('../public/sitemap.xml');
    for (const slug of slugs) {
      expect(sitemap, slug).toContain(`<loc>https://localpdfconverter.com/${slug}</loc>`);
    }
  });

  it('index.html 的静态内容链到每个工具页', () => {
    const html = read('../index.html');
    for (const slug of slugs) expect(html, slug).toContain(`href="/${slug}"`);
  });

  it('每个工具在四种语言里都有标题和说明', () => {
    for (const table of [zhCN, zhTW, en, ja]) {
      for (const tool of TOOLS) {
        expect(Object.hasOwn(table, `tool.${tool.id}.title`), tool.id).toBe(true);
        expect(Object.hasOwn(table, `tool.${tool.id}.lede`), tool.id).toBe(true);
      }
    }
  });

  it('每个工具都在导航里有自己的分组', () => {
    for (const group of ['from-pdf', 'to-pdf', 'image']) {
      expect(TOOLS.filter((tool) => tool.group === group).length, group).toBe(3);
    }
  });
});
