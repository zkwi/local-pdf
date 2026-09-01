import type {
  LayoutBlock,
  LayoutDocument,
  LayoutPage,
  TableBlock,
  TextLine,
} from '../contracts/layout.ts';
import type { ConvertOptions } from '../contracts/options.ts';
import type { DocumentMetadata } from '../contracts/primitives.ts';
import type {
  SemanticBlock,
  SemanticDocument,
  SemanticParagraph,
  SemanticRun,
  SemanticSection,
  SemanticTableCell,
  SemanticTableRow,
} from '../contracts/semantic.ts';
import { bottom } from '../geometry/bbox.ts';
import { median } from '../geometry/stats.ts';
import { lineJoinAction, matchListMarker, needsSpaceBetween } from '../layout/text.ts';

interface MutableRun {
  text: string;
  bold: boolean;
  italic: boolean;
  fontSize: number;
  fontFamily: string;
  fontName: string;
}

const MAX_INDENT_EM = 4;
const MAX_SPACE_AFTER_PT = 24;

export function buildSemanticDocument(
  layout: LayoutDocument,
  metadata: DocumentMetadata,
  options: ConvertOptions,
): SemanticDocument {
  const sections: SemanticSection[] = [];
  let current: {
    key: string;
    pages: LayoutPage[];
    blocks: SemanticBlock[];
  } | null = null;

  for (const page of layout.pages) {
    const key = sectionKey(page);
    if (current === null || current.key !== key) {
      if (current !== null) sections.push(finishSection(current.pages, current.blocks, options));
      current = { key, pages: [page], blocks: [] };
    } else {
      current.pages.push(page);
      if (current.blocks.length > 0) current.blocks.push({ kind: 'page-break' });
    }
    current.blocks.push(...buildPageBlocks(page, layout.bodyFontSize, options));
  }
  if (current !== null) sections.push(finishSection(current.pages, current.blocks, options));

  return {
    metadata,
    sections,
    warnings: [...layout.warnings, ...layout.pages.flatMap((p) => p.warnings)],
    defaultFontSizePt: layout.bodyFontSize,
  };
}

/** 只按纸张尺寸分节；页边距在节内取最小值，不再作为分节依据 */
function sectionKey(page: LayoutPage): string {
  return `${Math.round(page.width)}:${Math.round(page.height)}`;
}

function finishSection(
  pages: readonly LayoutPage[],
  blocks: SemanticBlock[],
  options: ConvertOptions,
): SemanticSection {
  const first = pages[0];
  const keep = options.keepHeaderFooter && options.mode !== 'plain-text';
  // 取最小值：任何一页的内容都不应该被页边距裁掉
  const margins = {
    top: Math.min(...pages.map((p) => p.margins.top)),
    right: Math.min(...pages.map((p) => p.margins.right)),
    bottom: Math.min(...pages.map((p) => p.margins.bottom)),
    left: Math.min(...pages.map((p) => p.margins.left)),
  };
  const header = keep ? pages.find((p) => p.header !== null)?.header ?? null : null;
  const footer = keep ? pages.find((p) => p.footer !== null)?.footer ?? null : null;

  return {
    pageWidthPt: first.width,
    pageHeightPt: first.height,
    margins,
    header: header ? [linesToParagraph(header.lines, 'center')] : [],
    footer: footer ? [pageNumberAware(footer.lines)] : [],
    blocks,
  };
}

/** 页脚里的纯数字换成 Word 的页码域，否则每一页都会印上第一页的页码 */
function pageNumberAware(lines: readonly TextLine[]): SemanticParagraph {
  const paragraph = linesToParagraph(lines, 'center');
  const runs = paragraph.runs.map((run) =>
    /^\s*\d{1,4}\s*$/.test(run.text) ? { ...run, text: '', field: 'page-number' as const } : run,
  );
  return { ...paragraph, runs };
}

function buildPageBlocks(
  page: LayoutPage,
  bodyFontSize: number,
  options: ConvertOptions,
): SemanticBlock[] {
  const out: SemanticBlock[] = [];
  const blocks = page.blocks;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];
    const spaceAfter = estimateSpaceAfter(block, next, bodyFontSize);

    if (options.mode === 'plain-text') {
      const flattened = flattenToParagraph(block, spaceAfter);
      if (flattened !== null) out.push(flattened);
      continue;
    }

    switch (block.kind) {
      case 'paragraph': {
        const runs = linesToRuns(block.lines);
        if (runs.length === 0) break;
        out.push({
          kind: 'paragraph',
          runs,
          alignment: block.alignment,
          firstLineIndentPt: clampIndent(block.firstLineIndent, block.lines[0]?.fontSize ?? bodyFontSize),
          spaceBeforePt: 0,
          spaceAfterPt: spaceAfter,
          lineSpacing: estimateLineSpacing(block.lines),
          sourceElementIds: block.meta.sourceElementIds,
        });
        break;
      }
      case 'heading': {
        const runs = linesToRuns(block.lines);
        if (runs.length === 0) break;
        out.push({
          kind: 'heading',
          level: block.level,
          runs,
          sourceElementIds: block.meta.sourceElementIds,
        });
        break;
      }
      case 'list-item': {
        const runs = linesToRuns(block.lines);
        if (runs.length === 0) break;
        const literal = block.markerStyle === 'other';
        out.push({
          kind: 'list-item',
          ordered: block.ordered,
          level: block.level,
          runs: literal ? runs : stripMarker(runs),
          literalMarker: literal ? block.marker : undefined,
          sourceElementIds: block.meta.sourceElementIds,
        });
        break;
      }
      case 'table': {
        out.push(buildTable(block));
        break;
      }
      case 'image': {
        out.push({
          kind: 'image',
          data: block.data,
          widthPt: block.widthPt,
          heightPt: block.heightPt,
          sourceElementIds: block.meta.sourceElementIds,
        });
        break;
      }
      case 'header':
      case 'footer':
        break;
    }
  }
  return out;
}

function flattenToParagraph(block: LayoutBlock, spaceAfter: number): SemanticParagraph | null {
  if (block.kind === 'image' || block.kind === 'header' || block.kind === 'footer') return null;
  const lines = block.kind === 'table' ? block.cells.flatMap((c) => c.lines) : block.lines;
  const runs = linesToRuns(lines);
  if (runs.length === 0) return null;
  return {
    kind: 'paragraph',
    runs,
    alignment: 'left',
    firstLineIndentPt: 0,
    spaceBeforePt: 0,
    spaceAfterPt: spaceAfter,
    lineSpacing: 1.15,
    sourceElementIds: block.meta.sourceElementIds,
  };
}

function buildTable(block: TableBlock): SemanticBlock {
  const grid: (SemanticTableCell | null)[][] = Array.from({ length: block.rows }, () =>
    new Array<SemanticTableCell | null>(block.cols).fill(null),
  );
  const skip: boolean[][] = Array.from({ length: block.rows }, () =>
    new Array<boolean>(block.cols).fill(false),
  );

  for (const cell of block.cells) {
    const paragraphs = groupCellLines(cell.lines);
    grid[cell.row][cell.col] = {
      rowSpan: cell.rowSpan,
      colSpan: cell.colSpan,
      blocks: paragraphs,
    };
    for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
        if (r !== cell.row || c !== cell.col) skip[r][c] = true;
      }
    }
  }

  const rows: SemanticTableRow[] = [];
  for (let r = 0; r < block.rows; r++) {
    const cells: SemanticTableCell[] = [];
    for (let c = 0; c < block.cols; c++) {
      if (skip[r][c]) continue;
      cells.push(grid[r][c] ?? { rowSpan: 1, colSpan: 1, blocks: [] });
    }
    rows.push({ cells });
  }

  return {
    kind: 'table',
    rows,
    columnWidthsPt: block.columnWidths,
    bordered: block.bordered,
    sourceElementIds: block.meta.sourceElementIds,
  };
}

/** 单元格内按行距切成若干段，避免整格挤成一行 */
function groupCellLines(lines: readonly TextLine[]): SemanticParagraph[] {
  if (lines.length === 0) return [];
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i].baseline - lines[i - 1].baseline);
  const base = median(gaps.filter((g) => g > 0)) || lines[0].fontSize * 1.2;

  const groups: TextLine[][] = [[lines[0]]];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].baseline - lines[i - 1].baseline > base * 1.6 + 1) groups.push([lines[i]]);
    else groups[groups.length - 1].push(lines[i]);
  }
  return groups
    .map((group) => linesToParagraph(group, 'left'))
    .filter((p) => p.runs.length > 0);
}

function linesToParagraph(
  lines: readonly TextLine[],
  alignment: 'left' | 'center' | 'right' | 'justify',
): SemanticParagraph {
  return {
    kind: 'paragraph',
    runs: linesToRuns(lines),
    alignment,
    firstLineIndentPt: 0,
    spaceBeforePt: 0,
    spaceAfterPt: 0,
    lineSpacing: 1.15,
    sourceElementIds: lines.flatMap((l) => l.spanIds),
  };
}

/**
 * 行 → 带样式的 run。同一行内相邻 span 样式相同就合并，
 * 行与行之间按中英文规则决定接空格、直接接、还是去连字符。
 */
export function linesToRuns(lines: readonly TextLine[]): SemanticRun[] {
  const runs: MutableRun[] = [];

  const push = (text: string, style: Omit<MutableRun, 'text'>): void => {
    const last = runs[runs.length - 1];
    if (
      last !== undefined &&
      last.bold === style.bold &&
      last.italic === style.italic &&
      Math.abs(last.fontSize - style.fontSize) < 0.26 &&
      last.fontFamily === style.fontFamily &&
      last.fontName === style.fontName
    ) {
      last.text += text;
    } else {
      runs.push({ text, ...style });
    }
  };

  for (const line of lines) {
    if (line.spans.length === 0) continue;
    const tail = runs.map((r) => r.text).join('');
    if (tail !== '') {
      const head = line.spans[0].text;
      const action = lineJoinAction(tail, head);
      if (action === 'space') runs[runs.length - 1].text += ' ';
      else if (action === 'dehyphen') {
        const last = runs[runs.length - 1];
        last.text = last.text.slice(0, -1);
      }
    }

    let accumulated = tail;
    for (let i = 0; i < line.spans.length; i++) {
      const span = line.spans[i];
      let text = span.text;
      if (i > 0 && needsSpaceBetween(accumulated, line.spans[i - 1], span)) text = ` ${text}`;
      accumulated += text;
      push(text, {
        bold: span.bold,
        italic: span.italic,
        fontSize: span.fontSize,
        fontFamily: span.fontFamily,
        fontName: span.fontName,
      });
    }
  }

  return runs
    .map((r) => ({
      text: r.text,
      bold: r.bold,
      italic: r.italic,
      fontSize: r.fontSize,
      fontFamily: r.fontFamily,
      fontName: r.fontName,
    }))
    .filter((r) => r.text !== '');
}

/** 列表项的编号交给 Word 的编号系统，正文里要去掉原始标记 */
function stripMarker(runs: readonly SemanticRun[]): SemanticRun[] {
  if (runs.length === 0) return [];
  const full = runs.map((r) => r.text).join('');
  const marker = matchListMarker(full);
  if (marker === null) return [...runs];

  let remaining = full.length - marker.rest.length;
  const out: SemanticRun[] = [];
  for (const run of runs) {
    if (remaining <= 0) {
      out.push(run);
      continue;
    }
    if (run.text.length <= remaining) {
      remaining -= run.text.length;
      continue;
    }
    out.push({ ...run, text: run.text.slice(remaining) });
    remaining = 0;
  }
  return out.filter((r) => r.text !== '');
}

function clampIndent(indent: number, fontSize: number): number {
  const em = fontSize > 0 ? fontSize : 10.5;
  if (indent < em * 0.4) return 0;
  return Math.min(indent, em * MAX_INDENT_EM);
}

function estimateLineSpacing(lines: readonly TextLine[]): number {
  if (lines.length < 2) return 1.15;
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i].baseline - lines[i - 1].baseline);
  const size = median(lines.map((l) => l.fontSize)) || 10.5;
  const ratio = median(gaps.filter((g) => g > 0)) / size;
  return Number.isFinite(ratio) ? Math.min(3, Math.max(0.9, ratio)) : 1.15;
}

function estimateSpaceAfter(
  block: LayoutBlock,
  next: LayoutBlock | undefined,
  bodyFontSize: number,
): number {
  if (next === undefined) return 0;
  const gap = next.meta.bbox.y - bottom(block.meta.bbox);
  if (!Number.isFinite(gap) || gap <= 0) return 0;
  const lineHeight = bodyFontSize * 0.35;
  return Math.min(MAX_SPACE_AFTER_PT, Math.max(0, Math.round(gap - lineHeight)));
}
