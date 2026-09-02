import type { TextLine } from '../contracts/layout.ts';

/** 页眉页脚候选带占页高的比例 */
const BAND_RATIO = 0.11;
/** 需要在多大比例的页面上重复出现才算页眉页脚 */
const REPEAT_RATIO = 0.5;

export interface PageLines {
  readonly index: number;
  readonly height: number;
  readonly lines: readonly TextLine[];
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
    { pages: Set<number>; entries: { page: number; id: string }[] }
  >();

  for (const page of pages) {
    const headerLimit = page.height * BAND_RATIO;
    const footerLimit = page.height * (1 - BAND_RATIO);
    for (const line of page.lines) {
      const cy = line.bbox.y + line.bbox.height / 2;
      const band = cy < headerLimit ? 'header' : cy > footerLimit ? 'footer' : null;
      if (band === null) continue;
      const text = line.text.trim();
      if (text === '') continue;
      // 纯页码单独归一，位置容差放宽到 12pt
      const key = isPureNumber(text)
        ? `${band}|<pageno>|${Math.round(cy / 12)}`
        : `${band}|${normalize(text)}|${Math.round(cy / 12)}`;
      let entry = counters.get(key);
      if (!entry) {
        entry = { pages: new Set(), entries: [] };
        counters.set(key, entry);
      }
      entry.pages.add(page.index);
      entry.entries.push({ page: page.index, id: line.id });
    }
  }

  const threshold = Math.max(2, Math.ceil(pages.length * REPEAT_RATIO));
  for (const [key, entry] of counters) {
    if (entry.pages.size < threshold) continue;
    const target = key.startsWith('header') ? headerLineIds : footerLineIds;
    for (const { page, id } of entry.entries) {
      let set = target.get(page);
      if (!set) {
        set = new Set();
        target.set(page, set);
      }
      set.add(id);
    }
  }

  return { headerLineIds, footerLineIds };
}
