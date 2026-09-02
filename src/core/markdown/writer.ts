import type {
  Html,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow,
} from 'mdast';
import type { BBox } from '../contracts/geometry.ts';
import type { Locale } from '../contracts/options.ts';
import { sanitizeText } from '../util/sanitize.ts';
import type { ConversionWarning } from '../contracts/layout.ts';
import type {
  SemanticBlock,
  SemanticDocument,
  SemanticImage,
  SemanticListItem,
  SemanticRun,
  SemanticTable,
  SemanticTableCell,
} from '../contracts/semantic.ts';

/**
 * SemanticDocument → Markdown。
 * 先建 mdast 再交给 remark-stringify 序列化，不手工拼字符串：
 * 转义（* _ # | < 等）、嵌套列表缩进、GFM 表格对齐这些细节交给它比自己写可靠。
 *
 * Markdown 表达不了坐标、页面尺寸、置信度，这些放进 manifest。
 */

export interface MarkdownManifestBlock {
  readonly id: string;
  readonly type: SemanticBlock['kind'];
  /** 0 起 */
  readonly page: number;
  readonly bbox?: BBox;
  readonly confidence?: number;
  readonly ocr?: boolean;
  /** 图片块对应的资源文件名 */
  readonly asset?: string;
}

export interface MarkdownManifest {
  readonly version: 1;
  readonly generator: 'local-pdf';
  readonly source: string;
  readonly pages: readonly {
    readonly index: number;
    readonly widthPt: number;
    readonly heightPt: number;
  }[];
  readonly blocks: readonly MarkdownManifestBlock[];
}

export interface MarkdownBundle {
  readonly markdown: string;
  /** 文件名（相对 assets/）→ PNG 字节 */
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly manifest: MarkdownManifest;
  readonly warnings: readonly ConversionWarning[];
}

interface Built {
  readonly root: Root;
  readonly assets: Map<string, Uint8Array>;
  readonly manifest: MarkdownManifest;
  readonly warnings: ConversionWarning[];
}

export async function writeMarkdown(
  doc: SemanticDocument,
  locale: Locale = 'en',
): Promise<MarkdownBundle> {
  const [{ unified }, { default: remarkStringify }, { default: remarkGfm }] = await Promise.all([
    import('unified'),
    import('remark-stringify'),
    import('remark-gfm'),
  ]);
  const built = buildMdast(doc, locale);
  const markdown = unified()
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: '-',
      emphasis: '*',
      strong: '*',
      fences: true,
      listItemIndent: 'one',
      rule: '-',
    })
    .stringify(built.root);
  return {
    markdown: String(markdown),
    assets: built.assets,
    manifest: built.manifest,
    warnings: built.warnings,
  };
}

export function buildMdast(doc: SemanticDocument, locale: Locale = 'en'): Built {
  const children: RootContent[] = [];
  const assets = new Map<string, Uint8Array>();
  const warnings: ConversionWarning[] = [];
  const manifestBlocks: MarkdownManifestBlock[] = [];
  const pages: { index: number; widthPt: number; heightPt: number }[] = [];

  let pageIndex = -1;
  let imagesOnPage = 0;
  let blockSeq = 0;
  let htmlTableWarned = false;

  const startPage = (widthPt: number, heightPt: number): void => {
    pageIndex++;
    imagesOnPage = 0;
    pages.push({ index: pageIndex, widthPt, heightPt });
    children.push(pageMarker(pageIndex));
  };

  const record = (block: SemanticBlock, asset?: string): void => {
    if (block.kind === 'page-break') return;
    const origin = block.origin;
    manifestBlocks.push({
      id: `b${blockSeq++}`,
      type: block.kind,
      page: origin?.pageIndex ?? pageIndex,
      bbox: origin?.bbox,
      confidence: origin?.confidence,
      ocr: origin?.ocr,
      asset,
    });
  };

  for (const section of doc.sections) {
    startPage(section.pageWidthPt, section.pageHeightPt);
    const blocks = section.blocks;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      switch (block.kind) {
        case 'page-break':
          startPage(section.pageWidthPt, section.pageHeightPt);
          break;
        case 'heading':
          children.push({
            type: 'heading',
            depth: block.level,
            children: runsToPhrasing(block.runs),
          });
          record(block);
          break;
        case 'paragraph': {
          const phrasing = runsToPhrasing(block.runs);
          if (phrasing.length === 0) break;
          children.push({ type: 'paragraph', children: phrasing });
          record(block);
          break;
        }
        case 'list-item': {
          // 连续的列表项合成一个列表；嵌套层级靠 level
          const items: SemanticListItem[] = [];
          while (i < blocks.length && blocks[i].kind === 'list-item') {
            const item = blocks[i] as SemanticListItem;
            items.push(item);
            record(item);
            i++;
          }
          i--;
          children.push(buildList(items));
          break;
        }
        case 'table': {
          const result = buildTable(block);
          children.push(result.node);
          if (result.html && !htmlTableWarned) {
            htmlTableWarned = true;
            warnings.push({ code: 'markdown-table-html' });
          }
          record(block);
          break;
        }
        case 'image': {
          imagesOnPage++;
          const ext = block.format === 'jpeg' ? 'jpg' : 'png';
          const name = `page-${String(pageIndex + 1).padStart(3, '0')}-image-${imagesOnPage}.${ext}`;
          assets.set(name, block.data);
          children.push({
            type: 'paragraph',
            children: [imageNode(block, name, pageIndex, imagesOnPage, locale)],
          });
          record(block, name);
          break;
        }
      }
    }
  }

  return {
    root: { type: 'root', children },
    assets,
    warnings,
    manifest: {
      version: 1,
      generator: 'local-pdf',
      source: doc.metadata.sourceFileName,
      pages,
      blocks: manifestBlocks,
    },
  };
}

function pageMarker(pageIndex: number): Html {
  return { type: 'html', value: `<!-- page: ${pageIndex + 1} -->` };
}

/** 图片替代文本是输出文件里唯一的自然语言，跟随界面语言 */
const IMAGE_ALT: Record<Locale, (page: number, seq: number) => string> = {
  'zh-CN': (page, seq) => `第 ${page} 页图 ${seq}`,
  'zh-TW': (page, seq) => `第 ${page} 頁圖 ${seq}`,
  en: (page, seq) => `Page ${page} image ${seq}`,
  ja: (page, seq) => `${page} ページ 図 ${seq}`,
};

function imageNode(
  block: SemanticImage,
  name: string,
  pageIndex: number,
  seq: number,
  locale: Locale,
): PhrasingContent {
  return {
    type: 'image',
    url: `assets/${name}`,
    alt: IMAGE_ALT[locale](pageIndex + 1, seq),
    title: `${Math.round(block.widthPt)}×${Math.round(block.heightPt)} pt`,
  };
}

/**
 * run → 行内节点。加粗/斜体的前后空白要挪到标记外面，
 * 否则 `** 文字**` 在 CommonMark 里不算强调。
 */
export function runsToPhrasing(runs: readonly SemanticRun[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  const pushText = (value: string): void => {
    if (value === '') return;
    const last = out[out.length - 1];
    if (last !== undefined && last.type === 'text') last.value += value;
    else out.push({ type: 'text', value });
  };

  for (const run of runs) {
    if (run.field === 'page-number') continue;
    const text = sanitizeText(run.text);
    if (text === '') continue;
    if (!run.bold && !run.italic) {
      pushText(text);
      continue;
    }
    const leading = text.match(/^\s*/)?.[0] ?? '';
    const trailing = text.match(/\s*$/)?.[0] ?? '';
    const core = text.slice(leading.length, text.length - trailing.length);
    pushText(leading);
    if (core !== '') {
      let node: PhrasingContent = { type: 'text', value: core };
      if (run.italic) node = { type: 'emphasis', children: [node] };
      if (run.bold) node = { type: 'strong', children: [node] };
      out.push(node);
    }
    pushText(trailing);
  }
  return out;
}

function buildList(items: readonly SemanticListItem[]): List {
  const makeList = (ordered: boolean): List => ({
    type: 'list',
    ordered,
    spread: false,
    children: [],
  });
  const makeItem = (item: SemanticListItem): ListItem => {
    const phrasing = runsToPhrasing(item.runs);
    // 中文数字、圆圈数字等 Markdown 没有对应编号，标记原样保留在正文里
    if (item.literalMarker !== undefined) {
      phrasing.unshift({ type: 'text', value: `${item.literalMarker} ` });
    }
    const paragraph: Paragraph = { type: 'paragraph', children: phrasing };
    return { type: 'listItem', spread: false, children: [paragraph] };
  };

  const rootLevel = items[0].level;
  const root = makeList(items[0].ordered && items[0].literalMarker === undefined);
  const stack: { level: number; list: List }[] = [{ level: rootLevel, list: root }];

  for (const item of items) {
    while (stack.length > 1 && item.level < stack[stack.length - 1].level) stack.pop();
    const top = stack[stack.length - 1];
    if (item.level > top.level && top.list.children.length > 0) {
      const nested = makeList(item.ordered && item.literalMarker === undefined);
      top.list.children[top.list.children.length - 1].children.push(nested);
      stack.push({ level: item.level, list: nested });
    }
    stack[stack.length - 1].list.children.push(makeItem(item));
  }
  return root;
}

function buildTable(table: SemanticTable): { node: Table | Html; html: boolean } {
  const merged = table.rows.some((r) => r.cells.some((c) => c.rowSpan > 1 || c.colSpan > 1));
  if (merged) return { node: { type: 'html', value: tableToHtml(table) }, html: true };

  const columns = Math.max(0, ...table.rows.map((r) => r.cells.length));
  const rows: TableRow[] = table.rows.map((row) => {
    const cells: TableCell[] = row.cells.map((cell) => ({
      type: 'tableCell',
      children: cellPhrasing(cell),
    }));
    while (cells.length < columns) cells.push({ type: 'tableCell', children: [] });
    return { type: 'tableRow', children: cells };
  });
  // GFM 表格必须有表头行；表格只有一行时补一行空表头，否则渲染不出来
  if (rows.length === 1) {
    rows.unshift({
      type: 'tableRow',
      children: Array.from({ length: columns }, () => ({ type: 'tableCell', children: [] })),
    });
  }
  return { node: { type: 'table', align: null, children: rows }, html: false };
}

function cellPhrasing(cell: SemanticTableCell): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const block of cell.blocks) {
    const phrasing = runsToPhrasing(block.runs);
    if (phrasing.length === 0) continue;
    if (out.length > 0) out.push({ type: 'text', value: ' ' });
    out.push(...phrasing);
  }
  return out;
}

function tableToHtml(table: SemanticTable): string {
  const escape = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const runsHtml = (runs: readonly SemanticRun[]): string =>
    runs
      .filter((r) => r.field === undefined)
      .map((r) => {
        let t = escape(r.text);
        if (r.italic) t = `<em>${t}</em>`;
        if (r.bold) t = `<strong>${t}</strong>`;
        return t;
      })
      .join('');

  const lines = ['<table>'];
  for (const row of table.rows) {
    lines.push('  <tr>');
    for (const cell of row.cells) {
      const attrs = [
        cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '',
        cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '',
      ].join('');
      const inner = cell.blocks.map((b) => runsHtml(b.runs)).join('<br>');
      lines.push(`    <td${attrs}>${inner}</td>`);
    }
    lines.push('  </tr>');
  }
  lines.push('</table>');
  return lines.join('\n');
}
