import { describe, expect, it } from 'vitest';
import { formatPageRange, isPageRangeValid, parsePageRange } from '../src/core/util/page-range.ts';

describe('页码范围', () => {
  it('界面验证开区间和巨大范围时不展开页号', () => {
    for (const input of ['8-', '-4', '1-9007199254740991', '3-1', ''])
      expect(isPageRangeValid(input)).toBe(true);
    for (const input of ['9007199254740992', '1e9', '0-', ',', '1-2-3'])
      expect(isPageRangeValid(input)).toBe(false);
    expect(parsePageRange('8-', 3)).toBeNull();
    expect(parsePageRange('1-9007199254740991', 3)).toEqual([0, 1, 2]);
    expect(parsePageRange('2-1', 1)).toEqual([0]);
  });
  it('空白表示全部页', () => {
    expect(parsePageRange('', 10)).toEqual([]);
    expect(parsePageRange('   ', 10)).toEqual([]);
  });

  it('单页、区间、开区间；逗号、顿号、空格都能分隔；区间写反了也认', () => {
    expect(parsePageRange('1-3, 5、8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9]);
    expect(parsePageRange('-2 4', 10)).toEqual([0, 1, 3]);
    expect(parsePageRange('3–1', 10)).toEqual([0, 1, 2]);
  });

  it('超出文档页数的部分忽略，结果去重升序；一页都没落在文档里算无效', () => {
    expect(parsePageRange('9-20, 2, 2', 10)).toEqual([1, 8, 9]);
    expect(parsePageRange('50', 10)).toBeNull();
  });

  it('写法不对返回 null', () => {
    for (const bad of ['a', '1-2-3', '-', '0', '1,,x', '1..3']) {
      expect(parsePageRange(bad, 10), bad).toBeNull();
    }
  });

  it('格式化成可读区间', () => {
    expect(formatPageRange([0, 1, 2, 4, 7, 8, 9])).toBe('1-3, 5, 8-10');
    expect(formatPageRange([])).toBe('');
    expect(formatPageRange([3, 3, 1])).toBe('2, 4');
  });
});
