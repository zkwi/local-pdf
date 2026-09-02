import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildImageReport,
  dpiToScale,
  packPageImages,
  pageImageName,
} from '../src/core/converter/images.ts';

const bytes = (n: number): Uint8Array => new Uint8Array([n, n + 1, n + 2]);

describe('PDF 转图片', () => {
  it('DPI 换算成 pdf.js 倍率：72 pt 一英寸，最低 0.5', () => {
    expect(dpiToScale(72)).toBe(1);
    expect(dpiToScale(150)).toBeCloseTo(2.0833, 3);
    expect(dpiToScale(10)).toBe(0.5);
  });

  it('文件名按总页数补零，JPEG 用 .jpg', () => {
    expect(pageImageName('doc', 0, 5, 'png')).toBe('doc-01.png');
    expect(pageImageName('doc', 99, 120, 'jpeg')).toBe('doc-100.jpg');
  });

  it('单页直接给图片文件', async () => {
    const single = packPageImages([{ index: 0, data: bytes(1) }], 1, 'doc', 'png');
    expect(single.kind).toBe('image');
    expect(single.fileName).toBe('doc.png');
    expect(single.blob.type).toBe('image/png');
    expect(new Uint8Array(await single.blob.arrayBuffer())).toEqual(bytes(1));
  });

  it('多页打成 zip，没渲染出来的页不占文件名', async () => {
    const multi = packPageImages(
      [
        { index: 0, data: bytes(1) },
        { index: 2, data: bytes(7) },
      ],
      3,
      'doc',
      'jpeg',
    );
    expect(multi.kind).toBe('image-bundle');
    expect(multi.fileName).toBe('doc.images.zip');
    const files = unzipSync(new Uint8Array(await multi.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['doc-01.jpg', 'doc-03.jpg']);
    expect(files['doc-03.jpg']).toEqual(bytes(7));
  });

  it('报告：每页一张图，渲染失败的页的警告留在文档级', () => {
    const report = buildImageReport(
      'a.pdf',
      [
        { index: 0, data: bytes(1) },
        { index: 2, data: bytes(2) },
      ],
      [
        { code: 'page-render-failed', pageIndex: 1, params: { page: 2, reason: 'x' } },
        { code: 'page-render-downscaled', pageIndex: 2, params: { page: 3, from: 4, to: '3.1' } },
        { code: 'page-limit-exceeded', params: { total: 9, limit: 3 } },
      ],
      { rendering: 10 },
      12,
    );
    expect(report.pageCount).toBe(2);
    expect(report.pages.map((p) => p.images)).toEqual([1, 1]);
    expect(report.pages[1].warnings.map((w) => w.code)).toEqual(['page-render-downscaled']);
    expect(report.warnings.map((w) => w.code)).toEqual([
      'page-render-failed',
      'page-limit-exceeded',
    ]);
  });
});
