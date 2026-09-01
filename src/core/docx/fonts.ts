export interface WordFont {
  readonly ascii: string;
  readonly hAnsi: string;
  readonly eastAsia: string;
  readonly cs: string;
}

interface Rule {
  readonly test: RegExp;
  readonly font: WordFont;
}

const make = (latin: string, cjk: string): WordFont => ({
  ascii: latin,
  hAnsi: latin,
  eastAsia: cjk,
  cs: latin,
});

/**
 * PDF 只保证嵌入字形，不保证目标机器装了同名字体。
 * 这里把常见字体名映射到 Word 侧大概率存在的字体，映射不上时按 serif/sans 回退。
 */
const RULES: readonly Rule[] = [
  { test: /simsun|songti|nsimsun|宋体/i, font: make('Times New Roman', '宋体') },
  { test: /simhei|heiti|黑体/i, font: make('Arial', '黑体') },
  { test: /(microsoft\s*)?yahei|msyh|微软雅黑/i, font: make('Segoe UI', '微软雅黑') },
  { test: /simkai|kaiti|楷体/i, font: make('Times New Roman', '楷体') },
  { test: /fangsong|仿宋/i, font: make('Times New Roman', '仿宋') },
  { test: /dengxian|等线/i, font: make('Calibri', '等线') },
  { test: /pingfang|苹方/i, font: make('Helvetica', '微软雅黑') },
  { test: /noto\s*sans\s*(sc|cjk)|source\s*han\s*sans/i, font: make('Arial', '思源黑体') },
  { test: /noto\s*serif\s*(sc|cjk)|source\s*han\s*serif/i, font: make('Times New Roman', '思源宋体') },
  { test: /times|georgia|garamond|minion|cambria/i, font: make('Times New Roman', '宋体') },
  { test: /arial|helvetica|verdana|tahoma|roboto|open\s*sans|lato/i, font: make('Arial', '微软雅黑') },
  { test: /calibri|segoe/i, font: make('Calibri', '等线') },
  { test: /courier|consol|mono|menlo/i, font: make('Consolas', '宋体') },
];

const SERIF = make('Times New Roman', '宋体');
const SANS = make('Arial', '微软雅黑');
const MONO = make('Consolas', '宋体');

export function mapFont(fontName: string | undefined, fontFamily: string | undefined): WordFont {
  const name = fontName ?? '';
  for (const rule of RULES) {
    if (rule.test.test(name)) return rule.font;
  }
  const family = (fontFamily ?? '').toLowerCase();
  if (family.includes('monospace')) return MONO;
  if (family.includes('serif') && !family.includes('sans')) return SERIF;
  return SANS;
}

/** 去掉 PDF 子集前缀（如 "ABCDEE+Calibri"），便于展示与统计 */
export function cleanFontName(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '');
}
