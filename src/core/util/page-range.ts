/**
 * 页码范围文本 ↔ 页索引。
 * 语法：逗号、顿号、分号或空格分隔；`3`、`2-5`、`7-`（到末页）、`-4`（从第 1 页起）。
 * 页码从 1 起，超出文档页数的部分忽略。
 */

const SEPARATOR = /[,，、;；\s]+/;
const TOKEN = /^(\d+)?([-–—~])?(\d+)?$/;

/** 只检查写法，不展开页码；输入框尚不知道文档页数。 */
export function isPageRangeValid(text: string): boolean {
  if (text.trim() === '') return true;
  const tokens = text.trim().split(SEPARATOR).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((token) => {
      const match = TOKEN.exec(token);
      if (match === null || (match[1] === undefined && match[3] === undefined)) return false;
      return [match[1], match[3]].every(
        (value) =>
          value === undefined || (Number.isSafeInteger(Number(value)) && Number(value) > 0),
      );
    })
  );
}

/**
 * 解析成 0 起的页索引，升序去重。
 * 空白文本返回 []，表示"全部页"；写法不对或一页都没选中返回 null。
 */
export function parsePageRange(text: string, total: number): number[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (!isPageRangeValid(text) || !Number.isSafeInteger(total) || total < 1) return null;
  const picked = new Set<number>();
  for (const token of trimmed.split(SEPARATOR)) {
    if (token === '') continue;
    const match = TOKEN.exec(token);
    if (match === null) return null;
    const [, first, dash, second] = match;
    if (first === undefined && second === undefined) return null;
    let start = first === undefined ? 1 : Number(first);
    let end = dash === undefined ? start : second === undefined ? total : Number(second);
    if (start < 1 || end < 1) return null;
    // 开区间的起点超过末页时没有交集，不能反转成“末页到起点”。
    if (start > end && second !== undefined) [start, end] = [end, start];
    end = Math.min(end, total);
    for (let page = start; page <= end; page++) picked.add(page - 1);
  }
  if (picked.size === 0) return null;
  return [...picked].sort((a, b) => a - b);
}

/** 把页索引压成 "1-3, 5, 8-10" 这种可读文本（1 起），摘要里用 */
export function formatPageRange(indices: readonly number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const from = sorted[i] + 1;
    const to = sorted[j] + 1;
    parts.push(from === to ? String(from) : `${from}-${to}`);
    i = j + 1;
  }
  return parts.join(', ');
}
