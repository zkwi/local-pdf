import { formatCounter, parseContent } from './counters.ts';
import type { ContentPart } from './counters.ts';

/**
 * docx-preview 把 Word 的自动编号写成 CSS 计数器（p.docx-num-{id}-{lvl}:before）。
 * 浏览器生成的 ::before 文本读不出来，这里把那份 CSS 解析回来自己算一遍。
 */

export interface NumberingRule {
  readonly parts: readonly ContentPart[];
  readonly fontFamily?: string;
  readonly listStyleType?: string;
}

export interface NumberingSheet {
  /** 段落类名 → 规则 */
  readonly rules: ReadonlyMap<string, NumberingRule>;
  /** 计数器名 → 初始值（start - 1） */
  readonly starts: ReadonlyMap<string, number>;
}

const NUM_CLASS = /^p\.([\w-]+-num-\d+-\d+)(:before)?$/;

function parseDeclarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /([\w-]+)\s*:\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;"'])*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.set(m[1].toLowerCase(), m[2].trim());
  return out;
}

export function parseNumberingCss(css: string): NumberingSheet {
  const rules = new Map<
    string,
    { parts: ContentPart[]; fontFamily?: string; listStyleType?: string }
  >();
  const starts = new Map<string, number>();
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1].trim();
    const decls = parseDeclarations(m[2]);
    for (const key of ['counter-reset', 'counter-set']) {
      const value = decls.get(key);
      if (value === undefined) continue;
      const tokens = value.split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const next = Number(tokens[i + 1]);
        if (Number.isFinite(next) && tokens[i + 1] !== '') {
          starts.set(tokens[i], next);
          i++;
        } else {
          starts.set(tokens[i], 0);
        }
      }
    }
    const hit = NUM_CLASS.exec(selector);
    if (hit === null) continue;
    const cls = hit[1];
    const rule = rules.get(cls) ?? { parts: [] };
    if (hit[2] !== undefined) {
      const content = decls.get('content');
      // 图片项目符号：content 是个空格，背景才是图；写成普通圆点
      if (decls.has('background')) rule.parts = [{ kind: 'text', text: '•' }];
      else if (content !== undefined) rule.parts = parseContent(content);
      const font = decls.get('font-family');
      if (font !== undefined) rule.fontFamily = font.replace(/^["']|["']$/g, '');
    } else {
      const type = decls.get('list-style-type');
      if (type !== undefined) rule.listStyleType = type;
    }
    rules.set(cls, rule);
  }
  return { rules, starts };
}

/**
 * 按文档顺序给每个带编号类的段落算出编号文本。
 * 上层编号出现时，同一列表更深层级的计数器全部回到起点（Word 的默认行为）。
 */
export function evaluateNumbering(classes: readonly string[], sheet: NumberingSheet): string[] {
  const counters = new Map(sheet.starts);
  return classes.map((cls) => {
    const m = /^(.*-num-\d+)-(\d+)$/.exec(cls);
    if (m === null) return '';
    const base = m[1];
    const level = Number(m[2]);
    for (let deeper = level + 1; deeper <= 9; deeper++) {
      const name = `${base}-${deeper}`;
      const start = sheet.starts.get(name);
      if (start !== undefined) counters.set(name, start);
    }
    counters.set(cls, (counters.get(cls) ?? 0) + 1);
    const rule = sheet.rules.get(cls);
    if (rule === undefined) return '';
    if (rule.parts.length === 0) {
      const style = rule.listStyleType ?? 'none';
      const text = formatCounter(counters.get(cls) ?? 0, style);
      return text === '' ? '' : `${text} `;
    }
    return rule.parts
      .map((part) => {
        if (part.kind === 'text') return part.text;
        // docx-preview 给模板里所有层级都套了本级的格式（"%1.%2" 在 lower-alpha 级里成了 a.a）；
        // 引用上级计数器时改用上级自己的格式
        const style = part.name === cls ? part.style : (ownStyle(sheet, part.name) ?? part.style);
        return formatCounter(counters.get(part.name) ?? 0, style);
      })
      .join('');
  });
}

/** 某一级在自己的模板里给自己的计数器用的格式 */
function ownStyle(sheet: NumberingSheet, cls: string): string | undefined {
  const rule = sheet.rules.get(cls);
  if (rule === undefined) return undefined;
  for (const part of rule.parts) {
    if (part.kind === 'counter' && part.name === cls) return part.style;
  }
  return rule.listStyleType;
}
