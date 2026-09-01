import { describe, expect, it } from 'vitest';
import {
  containsCjk,
  joinLineTexts,
  joinSpans,
  matchListMarker,
  matchSectionNumber,
} from '../src/core/layout/text.ts';

const s = (text: string, x: number, width: number, fontSize = 10) => ({
  text,
  bbox: { x, width },
  fontSize,
});

describe('joinSpans', () => {
  it('西文之间的明显间距补空格', () => {
    expect(joinSpans([s('Hello', 0, 30), s('world', 36, 30)])).toBe('Hello world');
  });

  it('西文之间的微小间距不补空格（同一个词被拆开）', () => {
    expect(joinSpans([s('Hel', 0, 18), s('lo', 18.4, 12)])).toBe('Hello');
  });

  it('中文之间不补空格，即使间距不小', () => {
    expect(joinSpans([s('本地', 0, 20), s('转换', 23, 20)])).toBe('本地转换');
  });

  it('中英边界的常规字距不补空格', () => {
    expect(joinSpans([s('中文', 0, 20), s('PDF', 21, 18)])).toBe('中文PDF');
  });

  it('已有空格时不重复补', () => {
    expect(joinSpans([s('Hello ', 0, 34), s('world', 40, 30)])).toBe('Hello world');
  });
});

describe('joinLineTexts', () => {
  it('西文换行补空格', () => {
    expect(joinLineTexts('the quick brown', 'fox jumps')).toBe('the quick brown fox jumps');
  });

  it('中文换行直接相接', () => {
    expect(joinLineTexts('这是一个很长的中文', '段落需要合并')).toBe('这是一个很长的中文段落需要合并');
  });

  it('行尾连字符 + 小写开头视为断词', () => {
    expect(joinLineTexts('conver-', 'sion')).toBe('conversion');
  });

  it('行尾连字符但下一行大写时保留', () => {
    expect(joinLineTexts('multi-', 'Column')).toBe('multi- Column');
  });

  it('中英混排边界不补空格', () => {
    expect(joinLineTexts('使用 PDF.js 解析，', 'docx.js 生成')).toBe('使用 PDF.js 解析，docx.js 生成');
  });
});

describe('matchListMarker', () => {
  it('识别项目符号', () => {
    expect(matchListMarker('• 第一项')).toEqual({
      ordered: false,
      marker: '•',
      rest: '第一项',
      style: 'bullet',
    });
  });

  it('区分能否交给 Word 自动编号', () => {
    expect(matchListMarker('1. 第一步')?.style).toBe('decimal');
    expect(matchListMarker('a) 选项')?.style).toBe('letter');
    // 中文数字、圆圈数字、带括号编号，Word 自动编号还原不了，必须保留原样
    expect(matchListMarker('三、结论')?.style).toBe('other');
    expect(matchListMarker('① 首项')?.style).toBe('other');
    expect(matchListMarker('（2）次项')?.style).toBe('other');
  });

  it('识别数字编号', () => {
    expect(matchListMarker('1. 第一步')?.ordered).toBe(true);
  });

  it('识别中文编号', () => {
    expect(matchListMarker('三、结论')?.ordered).toBe(true);
  });

  it('四位数字不当作编号（多为年份）', () => {
    expect(matchListMarker('2024. 全年营收')).toBeNull();
  });

  it('普通句子不误判', () => {
    expect(matchListMarker('这是一段普通正文。')).toBeNull();
  });
});

describe('matchSectionNumber', () => {
  it('识别多级章节号', () => {
    expect(matchSectionNumber('3.2.1 版面分析')).toBe(3);
    expect(matchSectionNumber('4 结论')).toBe(1);
  });

  it('不把小数当章节号', () => {
    expect(matchSectionNumber('3.14159 是圆周率')).toBe(2);
    expect(matchSectionNumber('普通段落')).toBeNull();
  });
});

describe('containsCjk', () => {
  it('区分中英文', () => {
    expect(containsCjk('hello')).toBe(false);
    expect(containsCjk('hello 世界')).toBe(true);
    expect(containsCjk('，')).toBe(true);
  });
});
