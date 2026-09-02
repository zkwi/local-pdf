import { describe, expect, it } from 'vitest';
import type {
  SemanticBlock,
  SemanticDocument,
  SemanticRun,
} from '../src/core/contracts/semantic.ts';
import { packMarkdown } from '../src/core/markdown/bundle.ts';
import { buildMdast, runsToPhrasing, writeMarkdown } from '../src/core/markdown/writer.ts';

const run = (text: string, extra: Partial<SemanticRun> = {}): SemanticRun => ({
  text,
  bold: false,
  italic: false,
  fontSize: 10.5,
  ...extra,
});

const paragraph = (...runs: SemanticRun[]): SemanticBlock => ({
  kind: 'paragraph',
  runs,
  alignment: 'left',
  firstLineIndentPt: 0,
  spaceBeforePt: 0,
  spaceAfterPt: 0,
  lineSpacing: 1.15,
  sourceElementIds: [],
});

const doc = (blocks: SemanticBlock[]): SemanticDocument => ({
  metadata: { pageCount: 1, sourceFileName: 'demo.pdf' },
  defaultFontSizePt: 10.5,
  warnings: [],
  sections: [
    {
      pageWidthPt: 595,
      pageHeightPt: 842,
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      header: [],
      footer: [],
      blocks,
    },
  ],
});

describe('writeMarkdown', () => {
  it('标题、段落、列表、页标记', async () => {
    const md = await writeMarkdown(
      doc([
        { kind: 'heading', level: 2, runs: [run('第一章')], sourceElementIds: [] },
        paragraph(run('普通文字 '), run('加粗', { bold: true }), run(' 结尾')),
        { kind: 'list-item', ordered: false, level: 0, runs: [run('甲')], sourceElementIds: [] },
        { kind: 'list-item', ordered: false, level: 1, runs: [run('甲一')], sourceElementIds: [] },
        { kind: 'list-item', ordered: false, level: 0, runs: [run('乙')], sourceElementIds: [] },
        { kind: 'page-break' },
        paragraph(run('第二页')),
      ]),
    );
    const text = md.markdown;
    expect(text.startsWith('<!-- page: 1 -->')).toBe(true);
    expect(text).toContain('## 第一章');
    expect(text).toContain('普通文字 **加粗** 结尾');
    expect(text).toMatch(/^- 甲\n\s+- 甲一\n- 乙/m);
    expect(text).toContain('<!-- page: 2 -->\n\n第二页');
    expect(md.manifest.pages).toHaveLength(2);
    expect(md.manifest.blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list-item',
      'list-item',
      'list-item',
      'paragraph',
    ]);
  });

  it('Markdown 特殊字符会被转义', async () => {
    const md = await writeMarkdown(doc([paragraph(run('a*b_c #d'))]));
    expect(md.markdown).toContain('a\\*b\\_c #d');
  });

  it('加粗 run 首尾的空格挪到标记外面', () => {
    const nodes = runsToPhrasing([run(' 粗 ', { bold: true })]);
    expect(nodes.map((n) => n.type)).toEqual(['text', 'strong', 'text']);
  });

  it('简单表格输出 GFM，合并单元格退成 HTML', async () => {
    const cell = (text: string, colSpan = 1) => ({
      rowSpan: 1,
      colSpan,
      blocks: [paragraph(run(text)) as Extract<SemanticBlock, { kind: 'paragraph' }>],
    });
    const md = await writeMarkdown(
      doc([
        {
          kind: 'table',
          rows: [{ cells: [cell('姓名'), cell('年龄')] }, { cells: [cell('张三'), cell('30')] }],
          columnWidthsPt: [100, 100],
          bordered: true,
          sourceElementIds: [],
        },
        {
          kind: 'table',
          rows: [{ cells: [cell('合并', 2)] }, { cells: [cell('a'), cell('b')] }],
          columnWidthsPt: [100, 100],
          bordered: true,
          sourceElementIds: [],
        },
      ]),
    );
    expect(md.markdown).toMatch(/\| 姓名 \| 年龄 \|\n\| -+ \| -+ \|\n\| 张三 \| 30 +\|/);
    expect(md.markdown).toContain('<td colspan="2">合并</td>');
    expect(md.warnings.some((w) => w.code === 'markdown-table-html')).toBe(true);
  });

  it('图片写进 assets，manifest 记录出处', () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const built = buildMdast(
      doc([
        {
          kind: 'image',
          data: png,
          format: 'png',
          widthPt: 200,
          heightPt: 100,
          sourceElementIds: ['img1'],
          origin: {
            pageIndex: 0,
            bbox: { x: 72, y: 90, width: 200, height: 100 },
            confidence: 1,
            ocr: false,
          },
        },
      ]),
    );
    expect([...built.assets.keys()]).toEqual(['page-001-image-1.png']);
    expect(built.manifest.blocks[0]).toMatchObject({
      type: 'image',
      page: 0,
      asset: 'page-001-image-1.png',
      bbox: { x: 72, y: 90 },
    });
  });
});

describe('packMarkdown', () => {
  it('没有图片就是单个 .md', async () => {
    const bundle = await writeMarkdown(doc([paragraph(run('hi'))]));
    const out = packMarkdown(bundle, 'demo');
    expect(out.kind).toBe('markdown');
    expect(out.fileName).toBe('demo.md');
    expect(await out.blob.text()).toContain('hi');
  });

  it('有图片就打成 zip', async () => {
    const bundle = await writeMarkdown(
      doc([
        {
          kind: 'image',
          data: new Uint8Array([1, 2, 3]),
          format: 'jpeg',
          widthPt: 10,
          heightPt: 10,
          sourceElementIds: [],
        },
      ]),
    );
    const out = packMarkdown(bundle, 'demo');
    expect(out.kind).toBe('markdown-bundle');
    expect(out.fileName).toBe('demo.markdown.zip');
    // zip 魔数 PK
    const head = new Uint8Array(await out.blob.slice(0, 2).arrayBuffer());
    expect([...head]).toEqual([0x50, 0x4b]);
  });
});
