import './pdfjs-polyfill.ts';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../src/core/contracts/options.ts';
import { convert } from '../src/core/converter/convert.ts';
import { isScanWithTextLayer } from '../src/core/ocr/engine.ts';
import { normalizeSquashedSpan, PdfSession } from '../src/core/pdf/extractor.ts';

const FIXTURE = new URL('./fixtures/scan-text-layer-rot270.pdf', import.meta.url);
const ASSET_BASE = 'http://localhost/';

/** pdf.js 会接管传入的 buffer，每次都新拷一份 */
function fixtureBytes(): ArrayBuffer {
  const buf = readFileSync(FIXTURE);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('normalizeSquashedSpan', () => {
  it('横着的行框、字却是竖的或倒的：按横排处理，字号取行高', () => {
    expect(
      normalizeSquashedSpan(270, { x: 47, y: 50, width: 422, height: 10 }, false, 0.8),
    ).toEqual({ rotation: 0, fontSize: 10, baseline: 58 });
    expect(
      normalizeSquashedSpan(180, { x: 71, y: 17, width: 156, height: 10 }, false, 0.8)?.rotation,
    ).toBe(0);
  });

  it('真正的旋转文字（竖长包围盒）、正常横排和竖排都不动', () => {
    expect(
      normalizeSquashedSpan(90, { x: 10, y: 10, width: 12, height: 200 }, false, 0.8),
    ).toBeNull();
    expect(
      normalizeSquashedSpan(0, { x: 10, y: 10, width: 200, height: 12 }, false, 0.8),
    ).toBeNull();
    expect(
      normalizeSquashedSpan(270, { x: 10, y: 10, width: 200, height: 12 }, true, 0.8),
    ).toBeNull();
  });

  it('文字层全是不可见的时候，连页码这种方块也按横排处理，竖长的仍不动', () => {
    const digit = { x: 24, y: 22, width: 8, height: 9 };
    expect(normalizeSquashedSpan(270, digit, false, 0.8)).toBeNull();
    expect(normalizeSquashedSpan(270, digit, false, 0.8, true)?.rotation).toBe(0);
    expect(
      normalizeSquashedSpan(90, { x: 10, y: 10, width: 12, height: 200 }, false, 0.8, true),
    ).toBeNull();
  });
});

describe('可搜索扫描件：/Rotate 270 的页面、不可见的压扁文字层', () => {
  it('抽取出来是横排小字号，文字层标记为不可见', async () => {
    const session = await PdfSession.open(fixtureBytes(), 'scan.pdf', { assetBase: ASSET_BASE });
    const page = await session.extractPage(0);
    await session.destroy();
    expect(page.rotation).toBe(270);
    expect(page.spans.length).toBeGreaterThanOrEqual(13);
    expect(page.spans.every((s) => s.rotation === 0)).toBe(true);
    expect(Math.max(...page.spans.map((s) => s.fontSize))).toBeLessThan(20);
    // 行高 8 / 9 / 10 全部吸附成同一个字号
    expect(new Set(page.spans.map((s) => s.fontSize)).size).toBe(1);
    expect(page.textHealth.hiddenText).toBe(true);
    expect(page.textHealth.imageCoverage).toBeGreaterThan(0.9);
    expect(isScanWithTextLayer(page)).toBe(true);
  });

  it('整份转换：整页图不保留，文字按段落输出，报告说明原因', async () => {
    const result = await convert({
      data: fixtureBytes(),
      fileName: 'scan.pdf',
      options: { ...DEFAULT_OPTIONS, ocr: 'off' },
      assetBase: ASSET_BASE,
    });
    const page = result.report.pages[0];
    expect(page?.images).toBe(0);
    expect(page?.characters).toBeGreaterThan(500);
    expect((page?.paragraphs ?? 0) + (page?.headings ?? 0)).toBeGreaterThanOrEqual(2);
    expect(result.report.warnings.map((w) => w.code)).toContain('scan-text-layer');
    expect(result.outputs[0]?.blob.size).toBeGreaterThan(1000);
  });
});
