/**
 * 构建后为每个工具页生成自己的静态 HTML：dist/word-to-pdf.html 等。
 * 单页应用只有一份 index.html，不跑 JS 的爬虫在 /word-to-pdf 看到的还是首页的标题和描述。
 * 这里把标题、描述、canonical、hreflang、Open Graph、首屏 h1 和启动脚本里的多语言标题换成对应工具的。
 * Cloudflare 静态资源默认把 /word-to-pdf 映射到 word-to-pdf.html，其他静态托管大多同理；
 * 映射不上的托管仍然回落到 index.html，应用照常工作。
 * 另外复制一份 index.html 作为 404.html：Cloudflare 对未知路径返回 404 状态时用它，应用照常加载。
 * 文案直接从 src/i18n/messages/ 的四张表读，tests/prerender.test.ts 核对读出来的值和表一致。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SITE_URL = 'https://localpdfconverter.com/';

/** 首页就是 PDF 转 Word，index.html 本身，不用再生成 */
export const TOOL_SLUGS = [
  'pdf-to-markdown',
  'pdf-to-images',
  'word-to-pdf',
  'markdown-to-pdf',
  'images-to-pdf',
];

export const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja'];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** 从文案表源码里取若干键的值。表是 `'key': 'value'` 的对象字面量，值可能换行、可能用双引号。 */
export function extractMessages(source, keys) {
  const out = {};
  for (const key of keys) {
    const re = new RegExp(`'${escapeRegExp(key)}':\\s*(['"])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`);
    const match = re.exec(source);
    if (match === null) throw new Error(`文案表里没有 ${key}`);
    out[key] = match[2].replace(/\\(['"\\])/g, '$1');
  }
  return out;
}

export function loadMessages(locale) {
  const source = readFileSync(join(root, 'src', 'i18n', 'messages', `${locale}.ts`), 'utf-8');
  const keys = [
    'tool.docTitle',
    'meta.suffix',
    ...TOOL_SLUGS.flatMap((slug) => [`tool.${slug}.title`, `tool.${slug}.lede`]),
  ];
  return extractMessages(source, keys);
}

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const js = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** 把首页的 HTML 改成某个工具页的；messages 是四种语言各自 loadMessages 的结果 */
export function renderToolPage(html, slug, messages) {
  const en = messages.en;
  const title = en['tool.docTitle'].replace('{tool}', en[`tool.${slug}.title`]);
  const description = `${en[`tool.${slug}.lede`]} ${en['meta.suffix']}`;
  const url = `${SITE_URL}${slug}`;
  let out = html;
  const replace = (pattern, replacement) => {
    if (!pattern.test(out)) throw new Error(`${slug}: index.html 里找不到 ${pattern}`);
    out = out.replace(pattern, replacement);
  };

  replace(/<title>[^<]*<\/title>/, `<title>${text(title)}</title>`);
  replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${attr(description)}$2`);
  replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  // hreflang：路径换成工具页，各语言保留自己的 ?lang=
  replace(
    /(<link rel="alternate" hreflang="[^"]+" href=")([^"]*)(")/g,
    (_match, before, href, after) => {
      const lang = new URL(href).searchParams.get('lang');
      return `${before}${url}${lang === null ? '' : `?lang=${lang}`}${after}`;
    },
  );
  replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${attr(title)}$2`);
  replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${attr(description)}$2`);
  // 首屏静态内容：h1 换成工具名，紧跟的一段换成工具描述
  replace(/<h1>[^<]*<\/h1>/, `<h1>${text(en[`tool.${slug}.title`])}</h1>`);
  replace(/(<h1>[^<]*<\/h1>\s*<p>)[^<]*(<\/p>)/, `$1${text(description)}$2`);
  // 启动脚本里 React 接管前显示的中文、日文标题和标语
  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    const m = messages[locale];
    const localTitle = m['tool.docTitle'].replace('{tool}', m[`tool.${slug}.title`]);
    replace(
      new RegExp(`((?:'${locale}'|${locale}): \\[\\s*)'[^']*',(\\s*)'[^']*',`),
      `$1'${js(localTitle)}',$2'${js(m[`tool.${slug}.lede`])}',`,
    );
  }
  return out;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = join(root, 'dist');
  const html = readFileSync(join(dist, 'index.html'), 'utf-8');
  const messages = Object.fromEntries(LOCALES.map((locale) => [locale, loadMessages(locale)]));
  for (const slug of TOOL_SLUGS) {
    writeFileSync(join(dist, `${slug}.html`), renderToolPage(html, slug, messages));
  }
  writeFileSync(join(dist, '404.html'), html);
  console.log(
    `已生成 ${TOOL_SLUGS.length} 个工具页（${TOOL_SLUGS.map((s) => `${s}.html`).join('、')}）和 404.html`,
  );
}
