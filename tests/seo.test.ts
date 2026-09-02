import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/messages/en.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const text = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');

describe('index.html 的静态 SEO 内容', () => {
  it('FAQ 问答与英文文案表一字不差', () => {
    for (let i = 1; i <= 5; i++) {
      expect(text).toContain(en[`seo.faq.q${i}` as keyof typeof en]);
      expect(text).toContain(en[`seo.faq.a${i}` as keyof typeof en]);
    }
  });

  it('三步说明与"为什么本地"也一致', () => {
    for (let i = 1; i <= 3; i++) expect(text).toContain(en[`seo.how.${i}` as keyof typeof en]);
    expect(text).toContain(en['seo.why.body']);
  });

  it('每种语言都有 hreflang，且有 x-default 和 canonical', () => {
    for (const code of ['x-default', 'en', 'zh-Hans', 'zh-Hant', 'ja']) {
      expect(html).toContain(`hreflang="${code}"`);
    }
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('property="og:title"');
  });

  it('meta description 与英文文案表一致', () => {
    expect(html).toContain(`content="${en['meta.description']}"`);
  });
});

describe('robots 与 sitemap', () => {
  it('sitemap 列出四种语言，robots 指向 sitemap', () => {
    const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf-8');
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'ja']) expect(sitemap).toContain(`?lang=${lang}`);
    const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf-8');
    expect(robots).toContain('Sitemap: https://localpdfconverter.com/sitemap.xml');
  });
});
