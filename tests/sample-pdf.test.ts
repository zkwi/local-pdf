import './pdfjs-polyfill.ts';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PdfSession } from '../src/core/pdf/extractor.ts';

const SAMPLE = new URL('../public/samples/demo.pdf', import.meta.url);
const ASSET_BASE = 'http://localhost/';

function sampleBytes(): ArrayBuffer {
  const buffer = readFileSync(SAMPLE);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe('shipped sample PDF', () => {
  it('is a neutral English document that exercises both pages', async () => {
    const session = await PdfSession.open(sampleBytes(), 'local-pdf-sample.pdf', {
      assetBase: ASSET_BASE,
    });

    try {
      expect(session.pageCount).toBe(2);
      expect(session.metadata.title).toBe('Local PDF sample document');

      const pages = await Promise.all(
        Array.from({ length: session.pageCount }, (_, index) => session.extractPage(index)),
      );
      const content = pages
        .flatMap((page) => page.spans)
        .map((span) => span.text)
        .join(' ');

      expect(content).toContain('Turn PDFs into editable documents');
      expect(content).toContain('Sample table');
      expect(content).toContain('Images, headers, and footers');
      expect(content).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
      expect(pages.every((page) => page.spans.length > 0)).toBe(true);
      expect(pages.some((page) => page.images.length > 0)).toBe(true);
    } finally {
      await session.destroy();
    }
  });
});
