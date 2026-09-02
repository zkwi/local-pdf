import type { LayoutBlock, TextLine } from '../contracts/layout.ts';
import type { Region } from './regions.ts';
import { bottom, overlapRatio1D, right, unionBBox } from '../geometry/bbox.ts';
import { median, percentile } from '../geometry/stats.ts';
import {
  containsCjk,
  endsSentence,
  matchCjkSectionLevel,
  matchListMarker,
  matchSectionNumber,
} from './text.ts';

export interface BlockContext {
  readonly pageIndex: number;
  readonly bodyFontSize: number;
  /** 字号是 OCR 从框高估出来的（自己识别的或文件自带的文字层），已被吸附成正文大小，标题不能只看字号 */
  readonly noisyFontSizes?: boolean;
  /** 本页所有正文行；判断某行同一高度上有没有别的行时用（分栏切分后区域里看不到隔壁栏） */
  readonly pageLines?: readonly TextLine[];
  /**
   * 这个区域的行应该排满到哪：没有并排区域时是本页文字的右边界。
   * 区域只有两三行短行时，最长的那行按区域自己的宽度永远"不短"，"地点：××"就会和下一行粘住
   */
  readonly lineRight?: number;
  /**
   * OCR 页上成片正文用到的字号（至少三条长行）。同一页里通知正文 16 号、附表 10 号，
   * 光按"比正文大 35%"判标题会把整段 16 号正文当成标题；这些字号一律不凭大小判标题
   */
  readonly textSizes?: readonly number[];
  /** 起始阅读序号，返回时会累加 */
  order: number;
}

/** 行距超过段内基准行距的这个倍数即认为换段 */
const PARAGRAPH_GAP_RATIO = 1.55;
/** 上一行右边界离栏宽还差这么多字宽，就认为该行是段末短行 */
const SHORT_LINE_SLACK = 2.5;
/** OCR 框的右边界也会抖一两个字宽，得放宽 */
const SHORT_LINE_SLACK_NOISY = 3.5;
/** 首行缩进阈值（字宽倍数） */
const INDENT_RATIO = 0.7;

export function buildBlocksForRegion(region: Region, ctx: BlockContext): LayoutBlock[] {
  const lines = region.lines;
  if (lines.length === 0) return [];

  const regionLeft = Math.min(...lines.map((l) => l.bbox.x));
  const regionRight = Math.max(...lines.map((l) => right(l.bbox)), ctx.lineRight ?? 0);
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
    const noisy = ctx.noisyFontSizes === true;
    if (shouldBreak(prev, line, { baseGap, regionLeft, regionRight, noisy })) {
      groups.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  groups.push(current);

  // 同一行高度上还有别的行（表格里的一格、"标签 值"里的值）的短行，不能光凭粗体判成标题
  const siblings = ctx.pageLines ?? lines;
  const hasRowSibling = (line: TextLine): boolean =>
    siblings.some(
      (other) =>
        other !== line &&
        overlapRatio1D(other.bbox.y, bottom(other.bbox), line.bbox.y, bottom(line.bbox)) > 0.5,
    );

  return groups.map((group) =>
    classify(group, ctx, regionLeft, regionRight, group.some(hasRowSibling)),
  );
}

interface BreakContext {
  readonly baseGap: number;
  readonly regionLeft: number;
  readonly regionRight: number;
  readonly noisy: boolean;
}

function shouldBreak(prev: TextLine, line: TextLine, ctx: BreakContext): boolean {
  const em = Math.min(prev.fontSize, line.fontSize) || 10;
  const gap = line.baseline - prev.baseline;

  if (gap > ctx.baseGap * PARAGRAPH_GAP_RATIO + 1) return true;
  if (Math.abs(prev.fontSize - line.fontSize) > em * 0.15) return true;
  if (prev.bold !== line.bold) return true;
  if (matchListMarker(line.text) !== null) return true;

  const slack = ctx.noisy ? SHORT_LINE_SLACK_NOISY : SHORT_LINE_SLACK;
  const prevIsShort = right(prev.bbox) < ctx.regionRight - em * slack;
  const lineIsShort = right(line.bbox) < ctx.regionRight - em * slack;
  // 悬挂缩进的列表里，续行只会缩进到项目文字处，不会比符号还靠左；比符号靠左的是下一段。
  // 但公文里"1.项目对象。……"首行缩进两字、续行顶格：符号行排满、下一行也排满的还是同一段
  if (
    matchListMarker(prev.text) !== null &&
    line.bbox.x < prev.bbox.x - em * INDENT_RATIO &&
    (prevIsShort || lineIsShort)
  )
    return true;
  // OCR 来的页面："1.3.1 农业农村现代化"、"2.项目文件"这类编号短行字号和正文一样，
  // 只能靠编号和长度认出来，前后都要断开，不然会和下一行正文粘成一段
  if (ctx.noisy && (isNumberedShortLine(prev, ctx) || isNumberedShortLine(line, ctx))) return true;

  // OCR 框的左边界能抖一两个字宽，缩进不可信：只看上一行是否提前收尾。
  // 中文两端对齐，段内每一行都排满，提前收尾的行就是段末，不必等句号——
  // "接口名称：无"、"公司名称：××公司" 这类一行一项的内容不然会粘成一段
  if (ctx.noisy) return prevIsShort && (endsSentence(prev.text) || containsCjk(prev.text));
  const lineIsIndented = line.bbox.x > ctx.regionLeft + em * INDENT_RATIO;

  // 上一行提前收尾且这一行没有缩进 → 上一段结束
  if (prevIsShort && !lineIsIndented && endsSentence(prev.text)) return true;
  // 中文两端对齐，段内每一行都排满，提前收尾的行就是段末，不管下一行有没有缩进：
  // "甲方（辅导方）：陆雄杰" 下一行 "乙方（家长方）：陈红丹" 不该粘成一段
  if (prevIsShort && containsCjk(prev.text)) return true;
  // 这一行明显缩进而上一行是满行 → 新段首行缩进
  if (lineIsIndented && !prevIsShort) return true;

  return false;
}

/**
 * OCR 页面上"1.3.1 农业农村现代化"、"2.项目文件"这类编号短行：字号和正文一样，只能靠编号认。
 * 项目符号行不算（"● 可管理性：……"的续行还在下一行），占满整行的也不算。
 */
function isNumberedShortLine(line: TextLine, ctx: BreakContext): boolean {
  const text = line.text.trim();
  if (text.length > 40 || endsSentence(text)) return false;
  if (right(line.bbox) >= ctx.regionRight - line.fontSize * SHORT_LINE_SLACK_NOISY) return false;
  const depth = matchSectionNumber(text);
  if (depth !== null && depth >= 2) return true;
  const marker = matchListMarker(text);
  return marker !== null && marker.ordered;
}

function classify(
  group: readonly TextLine[],
  ctx: BlockContext,
  regionLeft: number,
  regionRight: number,
  rowSibling: boolean,
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
  const size = median(group.map((l) => l.fontSize));
  const bodySize = isTextSize(size, ctx.textSizes)
    ? Math.max(ctx.bodyFontSize, size)
    : ctx.bodyFontSize;
  const headingLevel = detectHeading(group, bodySize, ctx.noisyFontSizes === true, rowSibling);
  // "一、背景" 这类中文标题同时能匹配上编号，字号明显大于正文时按标题处理
  const clearlyLarger =
    bodySize > 0 && size / bodySize >= sizeRatioForHeading(ctx.noisyFontSizes === true);

  // OCR 页面上"1.3.1 农业农村现代化"也能匹配上列表编号，但多级编号的短行是标题；
  // "1. 显式标识材料" 这种编号 + 粗体（按墨迹量出来的）的短行也是；
  // 公文里的"一、培训时间"不论来源，只要判成了标题就不当列表项
  const numberedHeading =
    headingLevel !== null &&
    (matchCjkSectionLevel(first.text) === 2 ||
      (ctx.noisyFontSizes === true &&
        ((matchSectionNumber(first.text) ?? 0) >= 2 || group.every((l) => l.bold))));
  if (
    marker !== null &&
    group.length <= 6 &&
    !(headingLevel !== null && clearlyLarger) &&
    !numberedHeading
  ) {
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

/** 这个字号在本页上是不是成片正文的字号（相差不到 12%） */
function isTextSize(size: number, textSizes: readonly number[] | undefined): boolean {
  return textSizes !== undefined && textSizes.some((t) => Math.abs(size / t - 1) < 0.12);
}

function estimateListLevel(x: number, regionLeft: number, fontSize: number): number {
  const indent = Math.max(0, x - regionLeft);
  return Math.min(4, Math.floor(indent / Math.max(fontSize * 1.4, 8)));
}

/** 只凭字号判标题的最小倍数：OCR 估的字号页与页之间能差 15%，得留出余量 */
function sizeRatioForHeading(noisy: boolean): number {
  return noisy ? 1.35 : 1.12;
}

function detectHeading(
  group: readonly TextLine[],
  bodyFontSize: number,
  noisy: boolean,
  rowSibling: boolean,
): 1 | 2 | 3 | 4 | null {
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
  const cjkLevel = matchCjkSectionLevel(text);

  // 只凭字号判标题：字号只大一点点（12 号说明配 10.5 号正文）的多行块、以顿号逗号收尾的行都不是
  const bySize =
    ratio >= sizeRatioForHeading(noisy) &&
    (group.length === 1 || ratio >= 1.25) &&
    !/[，、,]$/.test(text);
  const isHeading =
    bySize ||
    // 只凭粗体判标题时，旁边同一行高度上不能有别的行：表格里加粗的数值不是标题
    (bold && !rowSibling && ratio >= 0.98 && !endsSentence(text) && text.length <= 60) ||
    // 扫描的公文里"一、培训时间"这种黑体标题字号和正文一样，墨迹也未必量得出粗，只能靠编号认
    (noisy && cjkLevel === 2 && group.length === 1 && text.length <= 30 && !endsSentence(text)) ||
    (sectionDepth !== null &&
      ((bold && !rowSibling) || ratio >= (noisy ? sizeRatioForHeading(true) : 1.05))) ||
    // OCR 来的字号已经吸附成正文大小，"1.3.1 农业农村现代化"这种多级编号的短行只能靠编号认
    (noisy &&
      sectionDepth !== null &&
      sectionDepth >= 2 &&
      text.length <= 40 &&
      !endsSentence(text));
  if (!isHeading) return null;

  if (sectionDepth !== null) return Math.min(4, sectionDepth) as 1 | 2 | 3 | 4;
  if (cjkLevel !== null && ratio < 1.4) return cjkLevel;
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
