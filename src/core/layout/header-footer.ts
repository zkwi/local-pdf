import type { TextLine } from '../contracts/layout.ts';
import { cluster1D } from '../geometry/stats.ts';

/** 页眉页脚候选带占页高的比例 */
const BAND_RATIO = 0.11;
/** 需要在多大比例的页面上重复出现才算页眉页脚 */
const REPEAT_RATIO = 0.5;
/** 页边竖排的章节名每章不一样，在几页上重复就够了：正文里不会有竖排的字 */
const SIDE_REPEAT_PAGES = 3;
/** 同一条页眉页脚在相邻两页上的纵向位置最多差这么多（pt）：扫描件每页都有几 pt 的偏移 */
const POSITION_SPREAD = 20;

export interface PageLines {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly TextLine[];
}

/** 竖着印在页边的章节名（书籍的侧边页眉）：整行只有一个旋转片段 */
function isRotatedLine(line: TextLine): boolean {
  if (line.spans.length !== 1) return false;
  const span = line.spans[0];
  return span.vertical || (span.rotation >= 1 && span.rotation <= 359);
}

export interface HeaderFooterResult {
  /** pageIndex -> 被判定为页眉的行 id */
  readonly headerLineIds: ReadonlyMap<number, ReadonlySet<string>>;
  readonly footerLineIds: ReadonlyMap<number, ReadonlySet<string>>;
}

/** 数字替换成 #，让"第 3 页"和"第 12 页"能聚到一起 */
function normalize(text: string): string {
  return text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isPureNumber(text: string): boolean {
  return /^[-—–\s]*\d{1,4}[-—–\s]*$/.test(text.trim());
}

/**
 * 跨页重复检测：同一条页眉/页脚在多页的相同纵向位置反复出现，
 * 单页文档无从判断，直接返回空。
 */
export function detectHeadersFooters(pages: readonly PageLines[]): HeaderFooterResult {
  const headerLineIds = new Map<number, Set<string>>();
  const footerLineIds = new Map<number, Set<string>>();
  if (pages.length < 3) return { headerLineIds, footerLineIds };

  const counters = new Map<
    string,
    { pages: Set<number>; entries: { page: number; id: string; cy: number }[] }
  >();

  for (const page of pages) {
    const headerLimit = page.height * BAND_RATIO;
    const footerLimit = page.height * (1 - BAND_RATIO);
    const sideLimit = page.width * BAND_RATIO;
    for (const line of page.lines) {
      const cy = line.bbox.y + line.bbox.height / 2;
      const cx = line.bbox.x + line.bbox.width / 2;
      // 页边竖排的章节名跨页重复时也归入页眉，不然每一页正文里都会冒出一行
      const side = isRotatedLine(line) && (cx < sideLimit || cx > page.width - sideLimit);
      const band = side ? 'side' : cy < headerLimit ? 'header' : cy > footerLimit ? 'footer' : null;
      if (band === null) continue;
      const text = line.text.trim();
      if (text === '') continue;
      // 纯页码单独归一。先按文字聚，再看位置是否一致：按位置分桶的话，
      // 扫描件每页几 pt 的偏移会把同一条页眉拆到两个桶里，哪个桶都凑不够页数
      const key = isPureNumber(text) ? `${band}|<pageno>` : `${band}|${normalize(text)}`;
      let entry = counters.get(key);
      if (!entry) {
        entry = { pages: new Set(), entries: [] };
        counters.set(key, entry);
      }
      entry.pages.add(page.index);
      entry.entries.push({ page: page.index, id: line.id, cy });
    }
  }

  const threshold = Math.max(2, Math.ceil(pages.length * REPEAT_RATIO));
  for (const [key, entry] of counters) {
    const side = key.startsWith('side');
    const needed = side ? Math.min(threshold, SIDE_REPEAT_PAGES) : threshold;
    if (entry.pages.size < needed) continue;
    const target = key.startsWith('footer') ? footerLineIds : headerLineIds;
    // 同一段文字可能出现在两个固定位置（奇偶页的页码），按位置聚类后各自够页数的才算
    for (const cluster of cluster1D(
      entry.entries.map((e) => e.cy),
      POSITION_SPREAD,
    )) {
      const members = cluster.indices.map((i) => entry.entries[i]);
      if (new Set(members.map((m) => m.page)).size < needed) continue;
      for (const { page, id } of members) {
        let set = target.get(page);
        if (!set) {
          set = new Set();
          target.set(page, set);
        }
        set.add(id);
      }
    }
  }

  return { headerLineIds, footerLineIds };
}
