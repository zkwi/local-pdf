import { renderAsync } from 'docx-preview';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import { isSymbolFont, mapSymbolFontText } from '../pdf/symbols.ts';
import { canonicalize } from './html-to-pdf.ts';
import type { PageGeometry, Section } from './html-to-pdf.ts';
import { evaluateNumbering, parseNumberingCss } from './numbering.ts';

/**
 * Word → HTML 由 docx-preview 完成；这里把它的输出整理成可分页的节：
 * 读出页面尺寸和边距、拆出页眉页脚、把 CSS 计数器编号换成真正的文字、给页码域留位置。
 */

/** docx-preview 的样式值都是 pt 字符串，如 "595.3pt" */
function pt(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * docx-preview 把页眉写成 margin-top: calc(页眉距 - 上边距)，浏览器存下来的是算好的 calc(23.2px)。
 * 反推：页眉到纸边的距离 = 边距 + 这个差值。
 */
function distance(value: string, margin: number, fallback: number): number {
  const m = /calc\(\s*(-?[\d.]+)(px|pt)/.exec(value);
  if (m === null) return fallback;
  const delta = parseFloat(m[1]) * (m[2] === 'px' ? 0.75 : 1);
  return Math.max(0, margin + delta);
}

function readGeometry(section: HTMLElement): PageGeometry {
  const s = section.style;
  const width = pt(s.width, 595.28);
  const height = pt(s.minHeight, 841.89);
  const margins = {
    top: pt(s.paddingTop, 72),
    right: pt(s.paddingRight, 72),
    bottom: pt(s.paddingBottom, 72),
    left: pt(s.paddingLeft, 72),
  };
  const header = section.querySelector<HTMLElement>(':scope > header');
  const footer = section.querySelector<HTMLElement>(':scope > footer');
  return {
    width,
    height,
    margins,
    headerDistance:
      header === null
        ? margins.top / 2
        : distance(header.style.marginTop, margins.top, margins.top / 2),
    footerDistance:
      footer === null
        ? margins.bottom / 2
        : distance(footer.style.marginBottom, margins.bottom, margins.bottom / 2),
  };
}

function applyNumbering(doc: Document, container: HTMLElement): void {
  // 样式表这时已经搬到 head 里了，从整个文档收
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
  const sheet = parseNumberingCss(css);
  if (sheet.rules.size === 0) return;
  const paragraphs = [...container.querySelectorAll<HTMLElement>('p[class*="-num-"]')];
  const classes = paragraphs.map(
    (p) => [...p.classList].find((c) => /-num-\d+-\d+$/.test(c)) ?? '',
  );
  const labels = evaluateNumbering(classes, sheet);
  paragraphs.forEach((p, i) => {
    const rule = sheet.rules.get(classes[i]);
    const label = labels[i];
    if (rule === undefined || label === '') return;
    let text =
      rule.fontFamily !== undefined && isSymbolFont(rule.fontFamily)
        ? mapSymbolFontText(rule.fontFamily, label)
        : label;
    // 编号后面的制表位在网页里没有对应物，给一个不会被折掉的空格
    text = text.replace(/\t/g, ' ');
    if (!/\s$/.test(text)) text += ' ';
    const marker = doc.createElement('span');
    marker.className = 'lp-marker';
    marker.textContent = text;
    p.prepend(marker);
    p.style.listStyle = 'none';
  });
  const override = doc.createElement('style');
  override.textContent =
    'p[class*="-num-"]::before{content:none !important;display:none !important}';
  doc.head.append(override);
}

/** 页码域：PAGE / NUMPAGES / SECTIONPAGES，其他域（日期、目录）不动 */
function fieldKind(instruction: string): 'page' | 'pages' | null {
  const name = instruction.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  if (name === 'PAGE') return 'page';
  if (name === 'NUMPAGES' || name === 'SECTIONPAGES') return 'pages';
  return null;
}

/**
 * docx-preview 会把域指令整段丢掉，只留 Word 缓存的结果；不是 Word 存的文件（比如程序生成的）
 * 连结果都没有，页码就成了空白。先在 XML 里把页码域换成带书签的普通文字 "1"，
 * 渲染后靠书签认出它，写 PDF 时再逐页替换成真正的页码。
 */
function patchPageFields(xml: string, counter: { n: number }): string {
  const bookmark = (kind: 'page' | 'pages', rPr: string): string => {
    const id = 90000 + counter.n++;
    return `<w:bookmarkStart w:id="${id}" w:name="lp-field-${kind}-${id}"/><w:r>${rPr}<w:t>1</w:t></w:r><w:bookmarkEnd w:id="${id}"/>`;
  };
  const firstRPr = (chunk: string): string => /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(chunk)?.[0] ?? '';
  let out = xml.replace(
    /<w:fldSimple\b[^>]*\bw:instr="([^"]*)"[^>]*>([\s\S]*?)<\/w:fldSimple>/g,
    (match, instr: string, inner: string) => {
      const kind = fieldKind(instr);
      return kind === null ? match : bookmark(kind, firstRPr(inner));
    },
  );
  // 复杂域：从带 begin 的那个 run 到带 end 的那个 run
  out = out.replace(
    /<w:r\b(?:(?!<\/w:r>)[\s\S])*?fldCharType="begin"[\s\S]*?fldCharType="end"(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g,
    (match) => {
      const instr = [...match.matchAll(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g)]
        .map((m) => m[1])
        .join('');
      const kind = fieldKind(instr);
      return kind === null ? match : bookmark(kind, firstRPr(match));
    },
  );
  return out;
}

async function withPageFields(file: Blob): Promise<Blob> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return file;
  }
  const counter = { n: 0 };
  const patched: Zippable = {};
  let changed = false;
  for (const [name, data] of Object.entries(entries)) {
    if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) {
      const xml = strFromU8(data);
      const next = patchPageFields(xml, counter);
      if (next !== xml) {
        changed = true;
        patched[name] = [strToU8(next), { level: 6 }];
        continue;
      }
    }
    patched[name] = [data, { level: 0 }];
  }
  if (!changed) return file;
  return new Blob([zipSync(patched) as BlobPart], { type: file.type });
}

/** 书签 span 本身是空的，把紧跟着的那个 run 标成页码域，抽取时按页替换 */
function markPageFields(container: HTMLElement): void {
  for (const anchor of container.querySelectorAll<HTMLElement>('span[id^="lp-field-"]')) {
    const kind = anchor.id.split('-')[2];
    const run = anchor.nextElementSibling;
    if (run !== null && (kind === 'page' || kind === 'pages')) {
      run.setAttribute('data-lp-field', kind);
    }
    anchor.remove();
  }
}

export async function prepareDocx(
  doc: Document,
  file: Blob,
  signal?: AbortSignal,
): Promise<Section[]> {
  const source = await withPageFields(file);
  signal?.throwIfAborted();
  const container = doc.createElement('div');
  doc.body.append(container);
  await renderAsync(source, container, container, {
    inWrapper: false,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    useBase64URL: true,
    experimental: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderChanges: false,
    renderComments: false,
  });
  signal?.throwIfAborted();

  // docx-preview 在渲染完 500 ms 后才按制表位给 tab 定宽（setTimeout）；
  // 先把字体换成排版用的那套，让它按最终字体算，再等它算完，否则 tab 后面的文字会叠在一起
  canonicalize(container);
  if (container.querySelector('[class$="-tab-stop"]') !== null) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    signal?.throwIfAborted();
  }

  // 样式表要留在文档里；正文会被搬走，节容器随后清掉
  for (const style of container.querySelectorAll('style')) doc.head.append(style);
  applyNumbering(doc, container);
  markPageFields(container);

  const sections: Section[] = [];
  for (const sectionEl of container.querySelectorAll<HTMLElement>('section')) {
    const geometry = readGeometry(sectionEl);
    const header = sectionEl.querySelector<HTMLElement>(':scope > header');
    const footer = sectionEl.querySelector<HTMLElement>(':scope > footer');
    const body = doc.createElement('div');
    body.className = sectionEl.className;
    for (const child of [...sectionEl.children]) {
      if (child !== header && child !== footer) body.append(child);
    }
    const wrap = (el: HTMLElement | null): HTMLElement | null => {
      if (el === null) return null;
      const box = doc.createElement('div');
      box.className = sectionEl.className;
      box.append(el);
      return box;
    };
    sections.push({ body, header: wrap(header), footer: wrap(footer), geometry });
  }
  container.remove();
  if (sections.length === 0) throw new Error('document has no sections');
  return sections;
}
