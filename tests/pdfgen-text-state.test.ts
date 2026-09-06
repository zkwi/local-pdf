import './pdfjs-polyfill.ts';
import { describe, expect, it } from 'vitest';
import { getDocument, OPS } from 'pdfjs-dist';
import { installInContextPdfWorker } from '../src/core/pdf/pdfjs-runtime.ts';
import { ContentStream } from '../src/core/pdfgen/content.ts';
import { PdfDocument } from '../src/core/pdfgen/document.ts';
import { encodeWinAnsi } from '../src/core/pdfgen/fonts.ts';

describe('PDF 文字样式隔离', () => {
  it('后续普通文字不会继承上一段的描边粗体和字距', async () => {
    installInContextPdfWorker();
    const doc = new PdfDocument({ cjk: 'zh-CN' });
    const font = doc.font('sans', false, false, false);
    const stream = new ContentStream();
    const common = { font, size: 12, x: 40, color: [0, 0, 0] as const };
    stream.text({
      ...common,
      y: 160,
      hex: encodeWinAnsi('Heading'),
      fakeBold: true,
      charSpacing: 3,
    });
    stream.text({ ...common, y: 120, hex: encodeWinAnsi('Body') });
    doc.addPage({ width: 300, height: 200, content: stream.toString() });
    const task = getDocument({ data: doc.finish(), useSystemFonts: true });
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const ops = await page.getOperatorList();
      let state = { mode: 0, spacing: 0 };
      const stack: (typeof state)[] = [];
      const drawn: (typeof state)[] = [];
      ops.fnArray.forEach((op, i) => {
        if (op === OPS.save) stack.push({ ...state });
        else if (op === OPS.restore) state = stack.pop() ?? state;
        else if (op === OPS.setTextRenderingMode) state.mode = ops.argsArray[i][0] as number;
        else if (op === OPS.setCharSpacing) state.spacing = ops.argsArray[i][0] as number;
        else if (op === OPS.showText) drawn.push({ ...state });
      });
      expect(drawn).toEqual([
        { mode: 2, spacing: 3 },
        { mode: 0, spacing: 0 },
      ]);
      expect(stack).toHaveLength(0);
    } finally {
      await task.destroy();
    }
  });
});
