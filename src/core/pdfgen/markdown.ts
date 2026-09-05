import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { bulletFor } from './counters.ts';
import type { PageGeometry, Section } from './html-to-pdf.ts';
import { PAPER } from './page-layout.ts';
import { isLocalImageSource } from './resources.ts';

export type DocMargin = 'narrow' | 'normal' | 'wide';

export interface MarkdownPdfOptions {
  readonly pageSize: 'a4' | 'letter';
  readonly margin: DocMargin;
  /** 正文字号，pt */
  readonly fontSize: number;
}

const MARGIN_PT: Record<DocMargin, number> = { narrow: 36, normal: 56.7, wide: 72 };

export function documentGeometry(pageSize: 'a4' | 'letter', margin: DocMargin): PageGeometry {
  const [width, height] = PAPER[pageSize];
  const m = MARGIN_PT[margin];
  return {
    width,
    height,
    margins: { top: m, right: m, bottom: m, left: m },
    headerDistance: m / 2,
    footerDistance: m / 2,
  };
}

/** 原始 HTML 先保留，挂载前统一清理；合并单元格等安全 HTML 仍可使用。 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const source = markdown
    .replace(/^﻿/, '')
    .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '');
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(source);
  return String(file);
}

export function markdownCss(fontPx: number): string {
  return `
body { font-family: Arial, sans-serif; font-size: ${fontPx}px; line-height: 1.6; color: #1f2328; }
h1, h2, h3, h4, h5, h6 { font-weight: 700; line-height: 1.25; margin: 1.4em 0 0.6em; }
h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; margin-top: 0.4em; }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
h3 { font-size: 1.25em; } h4 { font-size: 1.05em; } h5 { font-size: 0.95em; } h6 { font-size: 0.9em; color: #57606a; }
p { margin: 0 0 1em; }
a { color: #0969da; text-decoration: none; }
strong { font-weight: 700; } em { font-style: italic; } del { text-decoration: line-through; }
code { font-family: 'Courier New', monospace; font-size: 0.9em; background: #f0f1f3; padding: 0.1em 0.3em; border-radius: 4px; }
pre { background: #f5f6f8; border: 1px solid #e3e5e8; border-radius: 6px; padding: 0.9em 1em; margin: 0 0 1em; white-space: pre-wrap; word-break: break-all; font-size: 0.875em; line-height: 1.5; }
pre code { background: none; padding: 0; font-size: 1em; }
blockquote { margin: 0 0 1em; padding: 0.1em 1em; color: #57606a; border-left: 0.25em solid #d0d7de; }
table { border-collapse: collapse; margin: 0 0 1em; max-width: 100%; }
th, td { border: 1px solid #d0d7de; padding: 0.35em 0.8em; vertical-align: top; text-align: left; }
th { background: #f5f6f8; font-weight: 700; }
hr { border: 0; border-top: 2px solid #d0d7de; margin: 1.5em 0; }
img { max-width: 100%; height: auto; }
ul, ol { list-style: none; margin: 0 0 1em; padding-left: 2em; }
ul ul, ol ol, ul ol, ol ul { margin-bottom: 0; }
li { position: relative; margin: 0.15em 0; }
li > p { margin: 0 0 0.4em; }
.lp-marker { position: absolute; right: 100%; margin-right: 0.5em; white-space: nowrap; text-align: right; }
li.task-list-item .lp-marker { display: none; }
li.task-list-item input { margin: 0 0.5em 0 -1.6em; vertical-align: 0.05em; width: 0.9em; height: 0.9em; }
`;
}

/** Markdown 相对路径引用的图片：按文件名从一起拖进来的文件里找 */
export type AssetMap = ReadonlyMap<string, Blob>;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareMarkdown(
  doc: Document,
  html: string,
  assets: AssetMap,
  options: MarkdownPdfOptions,
  signal?: AbortSignal,
): Promise<Section[]> {
  const style = doc.createElement('style');
  style.textContent = markdownCss((options.fontSize * 96) / 72);
  doc.head.append(style);

  // template 的内容不加载资源，必须清理完再挂到活动文档。
  const template = doc.createElement('template');
  template.innerHTML = html;
  let blocked = 0;
  const tags = new Set(
    'a p div span section article h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr th td caption colgroup col pre code blockquote strong em b i u s del sub sup br hr img input dl dt dd'.split(
      ' ',
    ),
  );
  const attributes = new Set(
    'href src alt title width height colspan rowspan span start value type checked disabled align'.split(
      ' ',
    ),
  );
  for (const el of template.content.querySelectorAll('*')) {
    if (!tags.has(el.tagName.toLowerCase())) {
      el.remove();
      blocked++;
      continue;
    }
    for (const attr of [...el.attributes]) {
      if (!attributes.has(attr.name)) el.removeAttribute(attr.name);
    }
    if (el.tagName === 'A' && !/^(https?:|mailto:|#)/i.test(el.getAttribute('href') ?? ''))
      el.removeAttribute('href');
    if (el.tagName === 'INPUT') {
      el.setAttribute('type', 'checkbox');
      el.setAttribute('disabled', '');
      el.parentElement?.classList.add('task-list-item');
    }
  }
  for (const img of template.content.querySelectorAll('img')) {
    signal?.throwIfAborted();
    const src = img.getAttribute('src') ?? '';
    if (isLocalImageSource(src)) continue;
    img.removeAttribute('src');
    if (/^[a-z][a-z\d+.-]*:|^[\\/]{2}/i.test(src.trim())) {
      blocked++;
      continue;
    }
    let name = src.split(/[\\/]/).pop() ?? '';
    try {
      name = decodeURIComponent(name);
    } catch {
      /* 文件名里的独立 % 按原样匹配 */
    }
    const blob = assets.get(name) ?? assets.get(name.toLowerCase());
    if (blob !== undefined) {
      const data = await readAsDataUrl(blob);
      if (isLocalImageSource(data)) img.src = data;
      else blocked++;
    }
  }
  signal?.throwIfAborted();
  const body = doc.createElement('div');
  body.dataset.lpBlockedContent = String(blocked);
  body.append(template.content);
  doc.body.append(body);

  // 浏览器的 ::marker 读不出来，编号和圆点写成真正的文字
  for (const li of body.querySelectorAll('li')) {
    const list = li.parentElement;
    if (list === null || li.classList.contains('task-list-item')) continue;
    let depth = -1;
    for (let el: HTMLElement | null = list; el !== null; el = el.parentElement) {
      if (el.tagName === 'UL' || el.tagName === 'OL') depth++;
    }
    let text: string;
    if (list.tagName === 'OL') {
      const start = parseInt(list.getAttribute('start') ?? '1', 10) || 1;
      text = `${start + [...list.children].indexOf(li)}.`;
    } else {
      text = bulletFor(depth);
    }
    const marker = doc.createElement('span');
    marker.className = 'lp-marker';
    marker.textContent = text;
    li.prepend(marker);
  }

  return [{ body, geometry: documentGeometry(options.pageSize, options.margin) }];
}
