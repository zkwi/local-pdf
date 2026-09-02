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
