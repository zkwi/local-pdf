import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { DEFAULT_OPTIONS } from '../src/core/contracts/options.ts';
import type { PrimitivePage, PrimitiveTextSpan } from '../src/core/contracts/primitives.ts';
import { writeDocx } from '../src/core/docx/writer.ts';
import type { ExtractedImage } from '../src/core/layout/analyze.ts';
import { analyzeDocument } from '../src/core/layout/analyze.ts';
import { buildSemanticDocument } from '../src/core/semantic/build.ts';
import { line } from './helpers.ts';

/** 1×1 的 PNG，docx 只是把字节塞进包里，不解码 */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

const WIDTH = 595;
const HEIGHT = 842;

function page(index: number, spans: PrimitiveTextSpan[], fullPageImage: boolean): PrimitivePage {
  return {
    index,
    width: WIDTH,
    height: HEIGHT,
    rotation: 0,
    spans,
    images: fullPageImage
      ? [
          {
            id: `img${index}`,
            pageIndex: index,
            bbox: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
            isMask: false,
          },
        ]
      : [],
    segments: [],
    links: [],
    textHealth: {
      charCount: spans.reduce((s, sp) => s + sp.text.length, 0),
      printableRatio: 1,
      replacementRatio: 0,
      imageCoverage: fullPageImage ? 1 : 0,
      textCoverage: 0.3,
      suspicious: false,
      hiddenText: false,
    },
    ocrApplied: false,
  };
}

const textPage = (index: number): PrimitivePage =>
  page(
    index,
    Array.from({ length: 6 }, (_, i) =>
      line('这是正文的一行内容，用来撑出页边距的位置。', 80, 100 + i * 14, 400, {
        pageIndex: index,
      }),
    ),
    false,
  );

describe('整页图和页边距', () => {
  const images = new Map<string, ExtractedImage>([
    ['img1', { data: PNG, format: 'png', widthPt: WIDTH, heightPt: HEIGHT }],
  ]);
  const doc = {
    metadata: { pageCount: 2, sourceFileName: 'x.pdf' },
    pages: [textPage(0), page(1, [], true)],
  };

  it('只有整页图的页不参与节的页边距，版式跟文字页走', () => {
    const layout = analyzeDocument(doc, images, DEFAULT_OPTIONS);
    expect(layout.pages[0].margins.left).toBe(80);
    expect(layout.pages[1].blocks.map((b) => b.kind)).toEqual(['image']);
    const semantic = buildSemanticDocument(layout, doc.metadata, DEFAULT_OPTIONS);
    expect(semantic.sections).toHaveLength(1);
    expect(semantic.sections[0].margins.left).toBe(80);
    expect(semantic.sections[0].margins.top).toBe(layout.pages[0].margins.top);
  });

  it('比版心宽的图等比缩进版心，不压到页边距外', async () => {
    const layout = analyzeDocument(doc, images, DEFAULT_OPTIONS);
    const semantic = buildSemanticDocument(layout, doc.metadata, DEFAULT_OPTIONS);
    const blob = await writeDocx(semantic);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = strFromU8(files['word/document.xml']);
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml);
    expect(extent).not.toBeNull();
    const { margins } = semantic.sections[0];
    const areaWidthEmu = (WIDTH - margins.left - margins.right) * 12700;
    const areaHeightEmu = (HEIGHT - margins.top - margins.bottom) * 12700;
    const cx = Number(extent?.[1]);
    const cy = Number(extent?.[2]);
    expect(cx).toBeLessThanOrEqual(areaWidthEmu * 1.01);
    expect(cy).toBeLessThanOrEqual(areaHeightEmu * 1.01);
    // 等比：宽高比和原图一致
    expect(cx / cy).toBeCloseTo(WIDTH / HEIGHT, 2);
  });

  it('正文行距按量到的基线间距写成最小行距，不随字体行高放大', async () => {
    const layout = analyzeDocument(doc, images, DEFAULT_OPTIONS);
    const semantic = buildSemanticDocument(layout, doc.metadata, DEFAULT_OPTIONS);
    const blob = await writeDocx(semantic);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = strFromU8(files['word/document.xml']);
    // 夹具：10pt 字、14pt 行距 → 280 twip，多行段落量得准，写 exact
    expect(xml).toContain('w:line="280" w:lineRule="exact"');
  });

  it('文字页上贴着纸边的背景图不把页边距顶到最小值', () => {
    const withBackground = {
      ...textPage(0),
      images: [
        {
          id: 'bg',
          pageIndex: 0,
          bbox: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
          isMask: false,
        },
      ],
    };
    const store = new Map<string, ExtractedImage>([
      ['bg', { data: PNG, format: 'png', widthPt: WIDTH, heightPt: HEIGHT }],
    ]);
    const layout = analyzeDocument(
      { metadata: { pageCount: 1, sourceFileName: 'x.pdf' }, pages: [withBackground] },
      store,
      DEFAULT_OPTIONS,
    );
    expect(layout.pages[0].blocks.some((b) => b.kind === 'image')).toBe(true);
    expect(layout.pages[0].margins.left).toBe(80);
  });
});
