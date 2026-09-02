import { describe, expect, it } from 'vitest';
import { ContentStream } from '../src/core/pdfgen/content.ts';
import { bulletFor, formatCounter, parseContent } from '../src/core/pdfgen/counters.ts';
import { PdfDocument } from '../src/core/pdfgen/document.ts';
import {
  canonicalStack,
  classifyFamily,
  encodeUcs2,
  encodeWinAnsi,
  isWinAnsi,
  standardFontName,
} from '../src/core/pdfgen/fonts.ts';
import { parseJpeg } from '../src/core/pdfgen/jpeg.ts';
import { markdownToHtml } from '../src/core/pdfgen/markdown.ts';
import { evaluateNumbering, parseNumberingCss } from '../src/core/pdfgen/numbering.ts';
import { placeImage } from '../src/core/pdfgen/page-layout.ts';
import { PdfBuilder, fmt, latin1, pdfTextString } from '../src/core/pdfgen/writer.ts';

const text = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

describe('PDF 写入器', () => {
  it('交叉引用表里的偏移量指向对应的对象', () => {
    const builder = new PdfBuilder();
    const first = builder.reserve();
    const second = builder.add('<< /Type /Catalog >>');
    builder.set(first, '<< /Type /Pages /Kids [] /Count 0 >>');
    const bytes = builder.build({ root: second });
    const s = text(bytes);
    expect(s.startsWith('%PDF-1.7\n')).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)\n%%EOF/.exec(s)?.[1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(2);
    expect(s.slice(entries[0], entries[0] + 7)).toBe('1 0 obj');
    expect(s.slice(entries[1], entries[1] + 7)).toBe('2 0 obj');
    expect(s).toContain('/Root 2 0 R');
  });

  it('流对象带 Length，压缩时加 FlateDecode', () => {
    const builder = new PdfBuilder();
    const raw = builder.addStream(' /Foo /Bar', latin1('hello'), false);
    const packed = builder.addStream('', latin1('hello hello hello hello'), true);
    const bytes = builder.build({ root: raw });
    const s = text(bytes);
    expect(s).toContain('<< /Foo /Bar /Length 5 >>\nstream\nhello\nendstream');
    const at = s.indexOf(`${packed} 0 obj\n<< /Filter /FlateDecode /Length`);
    expect(at).toBeGreaterThan(0);
    // zlib 头：0x78 开头（CMF），阅读器的 FlateDecode 靠它识别
    const streamAt = s.indexOf('stream\n', at) + 7;
    expect(bytes[streamAt]).toBe(0x78);
  });

  it('数字和文本串的格式', () => {
    expect(fmt(10)).toBe('10');
    expect(fmt(10.5)).toBe('10.5');
    expect(fmt(0.123456)).toBe('0.123');
    expect(fmt(-2.5)).toBe('-2.5');
    expect(pdfTextString('Ab')).toBe('<feff00410062>');
  });

  it('文档：页面树、字体和图片资源、链接注释', () => {
    const doc = new PdfDocument({ cjk: 'zh-CN', title: '测试' });
    const f1 = doc.font('sans', true, false, false);
    const f2 = doc.font('serif', false, false, true);
    expect(doc.font('sans', true, false, false)).toBe(f1);
    const im = doc.addImage('a', {
      filter: 'flate',
      colorSpace: 'rgb',
      data: new Uint8Array([255, 0, 0]),
      width: 1,
      height: 1,
    });
    const cs = new ContentStream();
    cs.text({ font: f1, size: 12, x: 10, y: 20, hex: encodeWinAnsi('Hi'), color: [0, 0, 0] });
    cs.text({
      font: f2,
      size: 12,
      x: 10,
      y: 40,
      hex: encodeUcs2('你好'),
      color: [0, 0, 1],
      fakeBold: true,
    });
    cs.image(im, 0, 0, 100, 50, 90);
    doc.addPage({
      width: 200,
      height: 100,
      content: cs.toString(),
      links: [{ x: 1, y: 2, width: 3, height: 4, url: 'https://example.com/a b' }],
    });
    const s = text(doc.finish());
    expect(s).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(s).toContain('/BaseFont /STSong-Light /Encoding /UniGB-UCS2-H');
    expect(s).toContain('/Ordering (GB1)');
    expect(s).toContain('/MediaBox [0 0 200 100]');
    expect(s).toContain('/Count 1');
    expect(s).toContain('/URI (https://example.com/a%20b)');
    expect(s).toContain('/Title <feff6d4b8bd5>');
    expect(cs.toString()).toContain('q 0 -50 100 0 0 50 cm /Im1 Do Q');
    expect(cs.toString()).toContain('2 Tr');
  });
});

describe('字体编码', () => {
  it('WinAnsi 覆盖 Latin-1 和常见标点，其余归到中日韩字体', () => {
    expect(isWinAnsi('A'.codePointAt(0)!)).toBe(true);
    expect(isWinAnsi('é'.codePointAt(0)!)).toBe(true);
    expect(isWinAnsi('€'.codePointAt(0)!)).toBe(true);
    expect(isWinAnsi('中'.codePointAt(0)!)).toBe(false);
    expect(encodeWinAnsi('A€"')).toBe('<418022>');
    expect(encodeWinAnsi('“x”')).toBe('<937894>');
    expect(encodeUcs2('中a')).toBe('<4e2d0061>');
  });

  it('字体族归类与标准字体名', () => {
    expect(classifyFamily('"Times New Roman", serif')).toBe('serif');
    expect(classifyFamily('SimSun')).toBe('serif');
    expect(classifyFamily('Consolas, monospace')).toBe('mono');
    expect(classifyFamily('Calibri, sans-serif')).toBe('sans');
    expect(standardFontName('serif', true, true)).toBe('Times-BoldItalic');
    expect(standardFontName('mono', false, false)).toBe('Courier');
    expect(classifyFamily(canonicalStack('serif'))).toBe('serif');
    expect(classifyFamily(canonicalStack('mono'))).toBe('mono');
    expect(classifyFamily(canonicalStack('sans'))).toBe('sans');
  });
});

describe('JPEG 头', () => {
  it('读出 SOF 里的尺寸和分量数，以及 EXIF 方向', () => {
    // SOI, APP1(Exif, 小端 TIFF, IFD0 一个条目 Orientation=6), SOF0 3 分量 4x2, SOS
    const exif = [
      0xff, 0xe1, 0x00, 0x1e, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00,
      0x00, 0x00,
    ];
    const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x04, 0x03, 0x01, 0x22, 0x00];
    const bytes = Uint8Array.from([0xff, 0xd8, ...exif, ...sof, 0xff, 0xda, 0x00, 0x02]);
    expect(parseJpeg(bytes)).toEqual({ width: 4, height: 2, components: 3, orientation: 6 });
    expect(parseJpeg(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('图片页面排版', () => {
  it('随图片：页面就是图片加边距', () => {
    expect(placeImage(300, 200, { pageSize: 'fit', orientation: 'auto', margin: 'none' })).toEqual({
      pageWidth: 300,
      pageHeight: 200,
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });
  });

  it('A4 自动方向：横图横放，等比缩放居中', () => {
    const p = placeImage(3000, 2000, { pageSize: 'a4', orientation: 'auto', margin: 'normal' });
    expect(p.pageWidth).toBeCloseTo(841.89, 2);
    expect(p.pageHeight).toBeCloseTo(595.28, 2);
    // 3:2 的图比 A4 横版更"方"，受高度限制
    expect(p.height).toBeCloseTo(595.28 - 56.7 * 2, 2);
    expect(p.width).toBeCloseTo(p.height * 1.5, 2);
    expect(p.y).toBeCloseTo(56.7, 2);
    expect(p.x).toBeCloseTo((p.pageWidth - p.width) / 2, 2);
  });

  it('固定纸张时小图也放大到填满内容区', () => {
    const p = placeImage(100, 100, { pageSize: 'letter', orientation: 'portrait', margin: 'none' });
    expect(p.width).toBe(612);
    expect(p.height).toBe(612);
    expect(p.y).toBe((792 - 612) / 2);
  });
});

describe('计数器样式', () => {
  it('各种编号格式', () => {
    expect(formatCounter(4, 'decimal')).toBe('4');
    expect(formatCounter(3, 'lower-alpha')).toBe('c');
    expect(formatCounter(28, 'upper-alpha')).toBe('AB');
    expect(formatCounter(14, 'lower-roman')).toBe('xiv');
    expect(formatCounter(2024, 'upper-roman')).toBe('MMXXIV');
    expect(formatCounter(7, 'decimal-leading-zero')).toBe('07');
    expect(formatCounter(11, 'cjk-ideographic')).toBe('十一');
    expect(formatCounter(21, 'simp-chinese-informal')).toBe('二十一');
    expect(formatCounter(105, 'simp-chinese-informal')).toBe('一百〇五');
    expect(formatCounter(3, 'simp-chinese-formal')).toBe('叁');
    expect(formatCounter(2024, 'cjk-decimal')).toBe('二〇二四');
    expect(formatCounter(1, 'disc')).toBe('•');
    expect(bulletFor(4)).toBe('◦');
  });

  it('解析 docx-preview 生成的 content 值', () => {
    expect(
      parseContent('""counter(docx-num-3-0, decimal)"."counter(docx-num-3-1, lower-alpha)")\\9"'),
    ).toEqual([
      { kind: 'counter', name: 'docx-num-3-0', style: 'decimal' },
      { kind: 'text', text: '.' },
      { kind: 'counter', name: 'docx-num-3-1', style: 'lower-alpha' },
      { kind: 'text', text: ')\t' },
    ]);
  });
});

describe('Word 自动编号求值', () => {
  const css = `
p.docx-num-1-0:before {\r\n  content: ""counter(docx-num-1-0, decimal)".\\9";\r\n  counter-increment: docx-num-1-0;\r\n}\r\n
p.docx-num-1-0 {\r\n  display: list-item;\r\n  list-style-type: none;\r\n  counter-set: docx-num-1-1 0;\r\n}\r\n
p.docx-num-1-1:before {\r\n  content: ""counter(docx-num-1-0, decimal)"."counter(docx-num-1-1, decimal)"\\9";\r\n  counter-increment: docx-num-1-1;\r\n}\r\n
p.docx-num-1-1 {\r\n  display: list-item;\r\n  list-style-type: none;\r\n}\r\n
p.docx-num-2-0:before {\r\n  content: "\\f0b7\\9";\r\n  counter-increment: docx-num-2-0;\r\n  font-family: Symbol;\r\n}\r\n
p.docx-num-2-0 {\r\n  display: list-item;\r\n  list-style-type: none;\r\n}\r\n
:root {\r\n  counter-reset: docx-num-1-0 0 docx-num-1-1 0 docx-num-2-0 0;\r\n}\r\n`;

  it('多级编号：上级出现时下级归零', () => {
    const sheet = parseNumberingCss(css);
    expect(sheet.rules.get('docx-num-2-0')?.fontFamily).toBe('Symbol');
    const labels = evaluateNumbering(
      [
        'docx-num-1-0',
        'docx-num-1-1',
        'docx-num-1-1',
        'docx-num-1-0',
        'docx-num-1-1',
        'docx-num-2-0',
        'docx-num-2-0',
      ],
      sheet,
    );
    expect(labels).toEqual(['1.\t', '1.1\t', '1.2\t', '2.\t', '2.1\t', '\uf0b7\t', '\uf0b7\t']);
  });

  it('引用上级计数器时用上级自己的格式，不是本级的', () => {
    const sheet = parseNumberingCss(
      'p.docx-num-3-0:before { content: ""counter(docx-num-3-0, decimal)"."; counter-increment: docx-num-3-0; }\n' +
        'p.docx-num-3-1:before { content: ""counter(docx-num-3-0, lower-alpha)"."counter(docx-num-3-1, lower-alpha)")"; counter-increment: docx-num-3-1; }\n' +
        ':root { counter-reset: docx-num-3-0 0 docx-num-3-1 0; }',
    );
    expect(evaluateNumbering(['docx-num-3-0', 'docx-num-3-1', 'docx-num-3-1'], sheet)).toEqual([
      '1.',
      '1.a)',
      '1.b)',
    ]);
  });

  it('start 不是 1 的列表从 counter-reset 的值接着数', () => {
    const sheet = parseNumberingCss(
      'p.docx-num-5-0:before { content: counter(docx-num-5-0, upper-roman) ; counter-increment: docx-num-5-0; }\n:root { counter-reset: docx-num-5-0 3; }',
    );
    expect(evaluateNumbering(['docx-num-5-0', 'docx-num-5-0'], sheet)).toEqual(['IV', 'V']);
  });
});

describe('Markdown → HTML', () => {
  it('GFM 表格、任务列表、代码块，front matter 被去掉', async () => {
    const html = await markdownToHtml(
      '---\ntitle: x\n---\n# 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n```js\nlet a = 1;\n```\n',
    );
    expect(html).not.toContain('title: x');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<pre><code class="language-js">');
  });
});
