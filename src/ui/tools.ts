import type { OutputFormat } from '../core/contracts/options.ts';

/** 六个工具：三个从 PDF 转出、三个转成 PDF；首页就是 PDF 转 Word */
export type ToolId =
  | 'pdf-to-word'
  | 'pdf-to-markdown'
  | 'pdf-to-images'
  | 'word-to-pdf'
  | 'markdown-to-pdf'
  | 'images-to-pdf';

export type ToolGroup = 'from-pdf' | 'to-pdf';

export interface Tool {
  readonly id: ToolId;
  /** 相对站点根的路径段；首页为空 */
  readonly slug: string;
  readonly group: ToolGroup;
  /** 文件选择框的 accept */
  readonly accept: string;
  /** 从 PDF 转出的工具对应的输出格式 */
  readonly output?: Exclude<OutputFormat, 'both'>;
}

const PDF_ACCEPT = 'application/pdf,.pdf';
export const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg';
export const DOCX_ACCEPT =
  '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MARKDOWN_ACCEPT = `.md,.markdown,.txt,text/markdown,text/plain,${IMAGE_ACCEPT}`;

export const TOOLS: readonly Tool[] = [
  { id: 'pdf-to-word', slug: '', group: 'from-pdf', accept: PDF_ACCEPT, output: 'docx' },
  {
    id: 'pdf-to-markdown',
    slug: 'pdf-to-markdown',
    group: 'from-pdf',
    accept: PDF_ACCEPT,
    output: 'markdown',
  },
  {
    id: 'pdf-to-images',
    slug: 'pdf-to-images',
    group: 'from-pdf',
    accept: PDF_ACCEPT,
    output: 'images',
  },
  { id: 'word-to-pdf', slug: 'word-to-pdf', group: 'to-pdf', accept: DOCX_ACCEPT },
  { id: 'markdown-to-pdf', slug: 'markdown-to-pdf', group: 'to-pdf', accept: MARKDOWN_ACCEPT },
  { id: 'images-to-pdf', slug: 'images-to-pdf', group: 'to-pdf', accept: IMAGE_ACCEPT },
];

export const HOME = TOOLS[0];

export function toolById(id: ToolId): Tool {
  return TOOLS.find((t) => t.id === id) ?? HOME;
}

/** 文件是不是这个工具收的：按扩展名和 MIME 各认一遍 */
export function acceptsFile(tool: Tool, file: File): boolean {
  const name = file.name.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  for (const token of tool.accept.split(',')) {
    const t = token.trim().toLowerCase();
    if (t === '') continue;
    if (t.startsWith('.')) {
      if (ext === t) return true;
    } else if (t.endsWith('/*')) {
      if (file.type.startsWith(t.slice(0, -1))) return true;
    } else if (file.type === t) {
      return true;
    }
  }
  return false;
}

export function isImageFile(file: File): boolean {
  return acceptsFile(TOOLS[5], file);
}

export function isMarkdownFile(file: File): boolean {
  return /\.(md|markdown|txt)$/i.test(file.name) || file.type === 'text/markdown';
}

/** 工具的"主要文件"：Markdown 页顺带也收图片（当作 .md 引用的素材），分流时不算它的票 */
function primaryAccepts(tool: Tool, file: File): boolean {
  return tool.id === 'markdown-to-pdf' ? isMarkdownFile(file) : acceptsFile(tool, file);
}

/**
 * 当前工具收不下这些文件时该切到哪个工具：按各工具能收的文件数计票，
 * 票多的赢，平票按工具顺序（PDF 归 PDF 转 Word）。一个都收不下返回 null。
 * Markdown 页只有在真有 .md 时才参与计票，但一旦参与，跟着 .md 一起拖进来的图片也算它的票，
 * 所以".md + 它引用的两张图"会去 Markdown 页而不是图片页。
 */
export function routeTool(files: readonly File[]): Tool | null {
  let best: Tool | null = null;
  let bestScore = 0;
  for (const tool of TOOLS) {
    const primary = files.filter((file) => primaryAccepts(tool, file)).length;
    const score = primary === 0 ? 0 : files.filter((file) => acceptsFile(tool, file)).length;
    if (score > bestScore) {
      best = tool;
      bestScore = score;
    }
  }
  return best;
}
