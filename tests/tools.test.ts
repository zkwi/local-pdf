import { describe, expect, it } from 'vitest';
import { acceptsFile, isImageFile, routeTool, toolById } from '../src/ui/tools.ts';

const file = (name: string, type = ''): File => new File(['x'], name, { type });

describe('工具收哪些文件', () => {
  it('按扩展名和 MIME 各认一遍', () => {
    expect(acceptsFile(toolById('pdf-to-word'), file('a.PDF'))).toBe(true);
    expect(acceptsFile(toolById('pdf-to-word'), file('blob', 'application/pdf'))).toBe(true);
    expect(acceptsFile(toolById('pdf-to-word'), file('a.docx'))).toBe(false);
    expect(acceptsFile(toolById('images-to-pdf'), file('blob', 'image/png'))).toBe(true);
    // Markdown 页顺带收图片，当作 .md 引用的素材
    expect(acceptsFile(toolById('markdown-to-pdf'), file('shot.png', 'image/png'))).toBe(true);
  });
});

describe('拖错页面时的分流', () => {
  it('PDF 归 PDF 转 Word，Word 归 Word 转 PDF，纯文本按 Markdown 处理', () => {
    expect(routeTool([file('a.pdf')])?.id).toBe('pdf-to-word');
    expect(routeTool([file('a.docx')])?.id).toBe('word-to-pdf');
    expect(routeTool([file('readme.txt')])?.id).toBe('markdown-to-pdf');
  });

  it('只有图片去图片转 PDF；.md 带着它引用的图片一起来则去 Markdown 转 PDF', () => {
    expect(routeTool([file('a.png', 'image/png'), file('b.jpg', 'image/jpeg')])?.id).toBe(
      'images-to-pdf',
    );
    expect(
      routeTool([file('notes.md'), file('x.png', 'image/png'), file('y.png', 'image/png')])?.id,
    ).toBe('markdown-to-pdf');
  });

  it('图片工具排在后面：拖到 PDF 页的图片仍去图片转 PDF；只有 HEIC 这类它收不下的才去图片压缩', () => {
    expect(routeTool([file('a.png', 'image/png')])?.id).toBe('images-to-pdf');
    expect(routeTool([file('IMG_0001.HEIC')])?.id).toBe('compress-images');
    expect(acceptsFile(toolById('convert-images'), file('scan.tif'))).toBe(true);
    expect(acceptsFile(toolById('resize-images'), file('icon.svg', 'image/svg+xml'))).toBe(true);
    expect(acceptsFile(toolById('compress-images'), file('a.pdf'))).toBe(false);
    expect(isImageFile(file('IMG_0001.HEIC'))).toBe(false);
  });

  it('谁都收不下就返回 null', () => {
    expect(routeTool([file('a.exe')])).toBeNull();
    expect(routeTool([])).toBeNull();
  });
});
