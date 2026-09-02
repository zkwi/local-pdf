import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ISectionOptions, ParagraphChild } from 'docx';
import type {
  SemanticBlock,
  SemanticDocument,
  SemanticHeading,
  SemanticListItem,
  SemanticParagraph,
  SemanticRun,
  SemanticTable,
} from '../contracts/semantic.ts';
import { sanitizeText } from '../util/sanitize.ts';
import { ptToHalfPoint, ptToPx96, ptToTwip } from '../geometry/units.ts';
import { cleanFontName, mapFont } from './fonts.ts';

const BULLET_REF = 'local-pdf-bullet';
const ORDERED_REF = 'local-pdf-ordered';
const LIST_INDENT_TWIP = 360;

const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
} as const;

const ALIGNMENT = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.BOTH,
} as const;

export async function writeDocx(doc: SemanticDocument): Promise<Blob> {
  const defaultSize = doc.defaultFontSizePt > 0 ? doc.defaultFontSizePt : 10.5;
  // docx.js 9.7 给每个 ImageRun 都新建一个编号器，所有图片的 docPr id 全是 1；
  // Word 对重复 id 时好时坏，自己编号最稳
  const imageIds = { next: 1 };

  const sections: ISectionOptions[] = doc.sections.map((section) => ({
    properties: {
      page: {
        size: {
          width: ptToTwip(section.pageWidthPt),
          height: ptToTwip(section.pageHeightPt),
        },
        margin: {
          top: ptToTwip(section.margins.top),
          right: ptToTwip(section.margins.right),
          bottom: ptToTwip(section.margins.bottom),
          left: ptToTwip(section.margins.left),
        },
      },
    },
    headers:
      section.header.length > 0
        ? { default: new Header({ children: section.header.map((p) => renderParagraph(p)) }) }
        : undefined,
    footers:
      section.footer.length > 0
        ? { default: new Footer({ children: section.footer.map((p) => renderParagraph(p)) }) }
        : undefined,
    children: renderBlocks(section.blocks, imageIds, {
      width: section.pageWidthPt - section.margins.left - section.margins.right,
      height: section.pageHeightPt - section.margins.top - section.margins.bottom,
    }),
  }));

  const file = new Document({
    title: doc.metadata.title,
    creator: doc.metadata.author ?? 'Local PDF',
    description: `Local PDF · ${doc.metadata.sourceFileName}`,
    styles: {
      default: {
        document: {
          run: { size: ptToHalfPoint(defaultSize), font: mapFont(undefined, 'serif') },
          paragraph: { spacing: { line: 276, lineRule: 'auto' } },
        },
      },
    },
    numbering: { config: [bulletConfig(), orderedConfig()] },
    sections: sections.length > 0 ? sections : [{ children: [new Paragraph('')] }],
  });

  return Packer.toBlob(file);
}

function bulletConfig(): { reference: string; levels: ReturnType<typeof levelsFor> } {
  return { reference: BULLET_REF, levels: levelsFor('bullet') };
}

function orderedConfig(): { reference: string; levels: ReturnType<typeof levelsFor> } {
  return { reference: ORDERED_REF, levels: levelsFor('ordered') };
}

function levelsFor(kind: 'bullet' | 'ordered') {
  const bullets = ['•', '◦', '▪', '‣'];
  const formats = [
    LevelFormat.DECIMAL,
    LevelFormat.LOWER_LETTER,
    LevelFormat.LOWER_ROMAN,
    LevelFormat.DECIMAL,
  ];
  return [0, 1, 2, 3].map((level) => ({
    level,
    format: kind === 'bullet' ? LevelFormat.BULLET : formats[level],
    text: kind === 'bullet' ? bullets[level] : `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: {
          left: LIST_INDENT_TWIP * 2 * (level + 1),
          hanging: LIST_INDENT_TWIP,
        },
      },
    },
  }));
}

/** 版心尺寸（pt），图片超出就等比缩进去，否则 Word 里会压到页边距外 */
interface TextArea {
  readonly width: number;
  readonly height: number;
}

/**
 * 分页写成下一段的"段前分页"，而不是单独一个带分页符的空段：
 * 上一页的内容刚好排满时，那个空段会被挤到下一页，再分一次页，Word 里就多出一张白纸
 */
function renderBlocks(
  blocks: readonly SemanticBlock[],
  imageIds: { next: number },
  area: TextArea,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let breakBefore = false;
  for (const block of blocks) {
    if (block.kind === 'page-break') {
      breakBefore = out.length > 0;
      continue;
    }
    const rendered = renderBlock(block, imageIds, area, breakBefore);
    if (breakBefore && rendered[0] instanceof Table) {
      out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    }
    breakBefore = false;
    out.push(...rendered);
  }
  return out;
}

function renderBlock(
  block: SemanticBlock,
  imageIds: { next: number },
  area: TextArea,
  breakBefore = false,
): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'paragraph':
      return [renderParagraph(block, breakBefore)];
    case 'heading':
      return [renderHeading(block, breakBefore)];
    case 'list-item':
      return [renderListItem(block, breakBefore)];
    case 'table':
      // Word 里两张紧邻的表会被合并，中间垫一个空段落隔开
      return [renderTable(block), new Paragraph({ children: [] })];
    case 'image': {
      const id = imageIds.next++;
      const fit = Math.min(
        1,
        area.width > 0 ? area.width / Math.max(1, block.widthPt) : 1,
        area.height > 0 ? area.height / Math.max(1, block.heightPt) : 1,
      );
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: breakBefore || undefined,
          children: [
            new ImageRun({
              type: block.format === 'jpeg' ? 'jpg' : 'png',
              data: block.data,
              altText: { name: `image${id}`, description: '', title: '', id: String(id) },
              transformation: {
                width: Math.max(1, Math.round(ptToPx96(block.widthPt * fit))),
                height: Math.max(1, Math.round(ptToPx96(block.heightPt * fit))),
              },
            }),
          ],
        }),
      ];
    }
    case 'page-break':
      return [new Paragraph({ children: [new PageBreak()] })];
  }
}

function renderRuns(runs: readonly SemanticRun[], fallbackSize: number): ParagraphChild[] {
  if (runs.length === 0) return [];
  return runs.map((run) => {
    const style = {
      bold: run.bold,
      italics: run.italic,
      size: ptToHalfPoint(run.fontSize > 0 ? run.fontSize : fallbackSize),
      font: mapFont(
        run.fontName === undefined ? undefined : cleanFontName(run.fontName),
        run.fontFamily,
      ),
    };
    // 页码交给 Word 自己算，写死数字的话每页都会印成同一个页码
    if (run.field === 'page-number') {
      return new TextRun({ ...style, children: [PageNumber.CURRENT] });
    }
    return new TextRun({ ...style, text: sanitizeText(run.text) });
  });
}

function renderParagraph(block: SemanticParagraph, breakBefore = false): Paragraph {
  const size = block.runs[0]?.fontSize ?? 10.5;
  return new Paragraph({
    alignment: ALIGNMENT[block.alignment],
    pageBreakBefore: breakBefore || undefined,
    indent:
      block.firstLineIndentPt > 0 ? { firstLine: ptToTwip(block.firstLineIndentPt) } : undefined,
    spacing: {
      after: ptToTwip(block.spaceAfterPt),
      before: ptToTwip(block.spaceBeforePt),
      // 行距按量到的基线间距写成绝对值，不用倍数：倍数行距乘的是字体自己的行高，
      // 微软雅黑这类行高 1.3 倍字号的字体会被撑得很稀，原来 3 页的文档排成 4 页。
      // 量准了的（多行段落）写 exact，Word 里的高度就和原文一样；估的写 atLeast
      line: ptToTwip(Math.max(size, block.lineSpacing * size)),
      lineRule: block.lineRule ?? 'atLeast',
    },
    children: renderRuns(block.runs, size),
  });
}

function renderHeading(block: SemanticHeading, breakBefore = false): Paragraph {
  return new Paragraph({
    heading: HEADING_BY_LEVEL[block.level],
    pageBreakBefore: breakBefore || undefined,
    // 原文里标题前后的空白已经量在相邻块的段后距里，这里不再额外加，否则页数会膨胀
    spacing: { before: 0, after: ptToTwip(block.spaceAfterPt ?? 6) },
    children: renderRuns(block.runs, 14),
  });
}

function renderListItem(block: SemanticListItem, breakBefore = false): Paragraph {
  const size = block.runs[0]?.fontSize ?? 10.5;
  const level = Math.min(3, Math.max(0, block.level));

  // 中文数字、圆圈数字这类编号 Word 的自动编号还原不了，
  // 保留原始标记文本，只用缩进模拟列表外观
  if (block.literalMarker !== undefined) {
    return new Paragraph({
      pageBreakBefore: breakBefore || undefined,
      indent: {
        left: LIST_INDENT_TWIP * 2 * (level + 1),
        hanging: LIST_INDENT_TWIP,
      },
      spacing: { after: 60, line: 276, lineRule: 'auto' },
      children: renderRuns(block.runs, size),
    });
  }

  return new Paragraph({
    pageBreakBefore: breakBefore || undefined,
    numbering: {
      reference: block.ordered ? ORDERED_REF : BULLET_REF,
      level,
    },
    spacing: { after: 60, line: 276, lineRule: 'auto' },
    children: renderRuns(block.runs, size),
  });
}

function renderTable(block: SemanticTable): Table {
  const border = block.bordered
    ? { style: BorderStyle.SINGLE, size: 4, color: '999999' }
    : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const columnWidths = block.columnWidthsPt.map((w) => ptToTwip(Math.max(12, w)));
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);

  const rows = block.rows.map(
    (row) =>
      new TableRow({
        children: row.cells.map((cell) => {
          const width = cell.colSpan > 1 ? undefined : columnWidths[0];
          return new TableCell({
            columnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
            rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
            borders,
            width: width === undefined ? undefined : { size: width, type: WidthType.DXA },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children:
              cell.blocks.length > 0
                ? cell.blocks.map((b) =>
                    b.kind === 'paragraph'
                      ? renderParagraph(b)
                      : b.kind === 'heading'
                        ? renderHeading(b)
                        : renderListItem(b),
                  )
                : [new Paragraph({ children: [] })],
          });
        }),
      }),
  );

  return new Table({
    rows,
    columnWidths,
    width: { size: totalWidth, type: WidthType.DXA },
    borders,
  });
}
