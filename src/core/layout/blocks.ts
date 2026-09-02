import type { LayoutBlock, TextLine } from '../contracts/layout.ts';
import type { Region } from './regions.ts';
import { right, unionBBox } from '../geometry/bbox.ts';
import { median, percentile } from '../geometry/stats.ts';
import { endsSentence, matchListMarker, matchSectionNumber } from './text.ts';

export interface BlockContext {
  readonly pageIndex: number;
  readonly bodyFontSize: number;
  /** 起始阅读序号，返回时会累加 */
  order: number;
}

/** 行距超过段内基准行距的这个倍数即认为换段 */
const PARAGRAPH_GAP_RATIO = 1.55;
/** 上一行右边界离栏宽还差这么多字宽，就认为该行是段末短行 */
const SHORT_LINE_SLACK = 2.5;
/** 首行缩进阈值（字宽倍数） */
const INDENT_RATIO = 0.7;

export function buildBlocksForRegion(region: Region, ctx: BlockContext): LayoutBlock[] {
  const lines = region.lines;
  if (lines.length === 0) return [];

  const regionLeft = Math.min(...lines.map((l) => l.bbox.x));
  const regionRight = Math.max(...lines.map((l) => right(l.bbox)));
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i].baseline - lines[i - 1].baseline);
  // 取偏小的分位数而不是中位数：段内行距才是基准，段间的大间距不该把阈值抬上去
  const positive = gaps.filter((g) => g > 0);
  const baseGap = percentile(positive, 0.3) || median(lines.map((l) => l.fontSize)) * 1.2;

  const groups: TextLine[][] = [];
  let current: TextLine[] = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    if (shouldBreak(prev, line, { baseGap, regionLeft, regionRight })) {
      groups.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  groups.push(current);

  return groups.map((group) => classify(group, ctx, regionLeft, regionRight));
}

interface BreakContext {
  readonly baseGap: number;
  readonly regionLeft: number;
  readonly regionRight: number;
}

function shouldBreak(prev: TextLine, line: TextLine, ctx: BreakContext): boolean {
  const em = Math.min(prev.fontSize, line.fontSize) || 10;
  const gap = line.baseline - prev.baseline;

  if (gap > ctx.baseGap * PARAGRAPH_GAP_RATIO + 1) return true;
  if (Math.abs(prev.fontSize - line.fontSize) > em * 0.15) return true;
  if (prev.bold !== line.bold) return true;
  if (matchListMarker(line.text) !== null) return true;

  const prevIsShort = right(prev.bbox) < ctx.regionRight - em * SHORT_LINE_SLACK;
  const lineIsIndented = line.bbox.x > ctx.regionLeft + em * INDENT_RATIO;

  // 上一行提前收尾且这一行没有缩进 → 上一段结束
  if (prevIsShort && !lineIsIndented && endsSentence(prev.text)) return true;
  // 这一行明显缩进而上一行是满行 → 新段首行缩进
  if (lineIsIndented && !prevIsShort) return true;

  return false;
}

function classify(
  group: readonly TextLine[],
  ctx: BlockContext,
  regionLeft: number,
  regionRight: number,
): LayoutBlock {
  const bbox = unionBBox(group.map((l) => l.bbox));
  const meta = {
    pageIndex: ctx.pageIndex,
    bbox,
    readingOrder: ctx.order++,
    confidence: 1,
    sourceElementIds: group.flatMap((l) => l.spanIds),
  };

  const first = group[0];
  const marker = matchListMarker(first.text);
  const headingLevel = detectHeading(group, ctx.bodyFontSize);
  // "一、背景" 这类中文标题同时能匹配上编号，字号明显大于正文时按标题处理
  const clearlyLarger =
    ctx.bodyFontSize > 0 && median(group.map((l) => l.fontSize)) / ctx.bodyFontSize >= 1.12;

  if (marker !== null && group.length <= 6 && !(headingLevel !== null && clearlyLarger)) {
    return {
      kind: 'list-item',
      meta,
      ordered: marker.ordered,
      marker: marker.marker,
      markerStyle: marker.style,
      level: estimateListLevel(first.bbox.x, regionLeft, first.fontSize),
      lines: [...group],
    };
  }

  if (headingLevel !== null) {
    return { kind: 'heading', meta, level: headingLevel, lines: [...group] };
  }

  return {
    kind: 'paragraph',
    meta,
    lines: [...group],
    firstLineIndent: first.bbox.x - regionLeft,
    alignment: detectAlignment(group, regionLeft, regionRight),
  };
}

function estimateListLevel(x: number, regionLeft: number, fontSize: number): number {
  const indent = Math.max(0, x - regionLeft);
  return Math.min(4, Math.floor(indent / Math.max(fontSize * 1.4, 8)));
}

function detectHeading(group: readonly TextLine[], bodyFontSize: number): 1 | 2 | 3 | 4 | null {
  if (group.length > 3) return null;
  const text = group
    .map((l) => l.text)
    .join(' ')
    .trim();
  if (text.length === 0 || text.length > 120) return null;

  const size = median(group.map((l) => l.fontSize));
  const ratio = bodyFontSize > 0 ? size / bodyFontSize : 1;
  const bold = group.every((l) => l.bold);
  const sectionDepth = matchSectionNumber(text);

  const isHeading =
    ratio >= 1.12 ||
    (bold && ratio >= 0.98 && !endsSentence(text) && text.length <= 60) ||
    (sectionDepth !== null && (bold || ratio >= 1.05));
  if (!isHeading) return null;

  if (sectionDepth !== null) return Math.min(4, sectionDepth) as 1 | 2 | 3 | 4;
  if (ratio >= 1.7) return 1;
  if (ratio >= 1.4) return 2;
  if (ratio >= 1.18) return 3;
  return 4;
}

function detectAlignment(
  group: readonly TextLine[],
  regionLeft: number,
  regionRight: number,
): 'left' | 'center' | 'right' | 'justify' {
  const width = Math.max(1, regionRight - regionLeft);
  const leftGaps = group.map((l) => l.bbox.x - regionLeft);
  const rightGaps = group.map((l) => regionRight - right(l.bbox));
  const avgLeft = leftGaps.reduce((a, b) => a + b, 0) / group.length;
  const avgRight = rightGaps.reduce((a, b) => a + b, 0) / group.length;

  if (avgLeft > width * 0.12 && Math.abs(avgLeft - avgRight) < width * 0.06) return 'center';
  if (avgLeft > width * 0.25 && avgRight < width * 0.05) return 'right';

  if (group.length >= 3) {
    const fullLines = group
      .slice(0, -1)
      .filter((l) => regionRight - right(l.bbox) < l.fontSize * 0.6);
    if (fullLines.length === group.length - 1) return 'justify';
  }
  return 'left';
}
