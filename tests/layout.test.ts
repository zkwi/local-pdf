import { describe, expect, it } from 'vitest';
import { buildLines } from '../src/core/layout/lines.ts';
import { segmentRegions } from '../src/core/layout/regions.ts';
import { buildBlocksForRegion } from '../src/core/layout/blocks.ts';
import { detectHeadersFooters } from '../src/core/layout/header-footer.ts';
import { line, span } from './helpers.ts';

describe('buildLines', () => {
  it('同一基线的 span 合成一行', () => {
    const { lines } = buildLines([
      span({ text: '本地', x: 72, baseline: 100 }),
      span({ text: '转换', x: 83, baseline: 100.2 }),
      span({ text: '下一行', x: 72, baseline: 114 }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('本地转换');
    expect(lines[1].text).toBe('下一行');
  });

  it('上下标不会把一行拆开', () => {
    const { lines } = buildLines([
      span({ text: 'E=mc', x: 72, baseline: 100, fontSize: 12 }),
      span({ text: '2', x: 100, baseline: 96.5, fontSize: 7 }),
    ]);
    expect(lines).toHaveLength(1);
  });

  it('行按纵向位置排序', () => {
    const { lines } = buildLines([
      span({ text: 'B', x: 72, baseline: 200 }),
      span({ text: 'A', x: 72, baseline: 100 }),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['A', 'B']);
  });
});

describe('segmentRegions', () => {
  it('单栏页面不产生跨栏切分', () => {
    const spans = Array.from({ length: 6 }, (_, i) =>
      line('这是单栏正文这是单栏正文这是单栏正文', 72, 100 + i * 14, 400),
    );
    const { lines } = buildLines(spans);
    const result = segmentRegions(lines, 595);
    expect(result.columnCount).toBe(1);
  });

  it('双栏页面切成左右两栏，且不跨栏串行', () => {
    const spans = [
      ...Array.from({ length: 8 }, (_, i) => line(`左栏第${i}行`, 60, 120 + i * 14, 200)),
      ...Array.from({ length: 8 }, (_, i) => line(`右栏第${i}行`, 320, 120 + i * 14, 200)),
    ];
    const { lines } = buildLines(spans);
    const result = segmentRegions(lines, 595);

    expect(result.columnCount).toBe(2);
    const order = result.regions.flatMap((r) => r.lines.map((l) => l.text));
    const firstRight = order.findIndex((t) => t.startsWith('右栏'));
    const lastLeft = order.map((t) => t.startsWith('左栏')).lastIndexOf(true);
    expect(lastLeft).toBeLessThan(firstRight);
  });

  it('跨栏标题不会被切进某一栏', () => {
    const spans = [
      line('一个横跨整页的大标题', 60, 90, 460, { fontSize: 18 }),
      ...Array.from({ length: 6 }, (_, i) => line(`左栏第${i}行`, 60, 130 + i * 14, 200)),
      ...Array.from({ length: 6 }, (_, i) => line(`右栏第${i}行`, 320, 130 + i * 14, 200)),
    ];
    const { lines } = buildLines(spans);
    const result = segmentRegions(lines, 595);
    const order = result.regions.flatMap((r) => r.lines.map((l) => l.text));
    expect(order[0]).toBe('一个横跨整页的大标题');
    expect(result.columnCount).toBe(2);
  });
});

describe('buildBlocksForRegion', () => {
  const analyze = (spans: ReturnType<typeof line>[], bodyFontSize = 10) => {
    const { lines } = buildLines(spans);
    const ctx = { pageIndex: 0, bodyFontSize, order: 0 };
    return segmentRegions(lines, 595).regions.flatMap((region) =>
      buildBlocksForRegion(region, ctx),
    );
  };

  it('行距变大处换段', () => {
    const blocks = analyze([
      line('第一段第一行第一段第一行第一段第一行', 72, 100, 400),
      line('第一段第二行', 72, 114, 200),
      line('第二段第一行第二段第一行第二段第一行', 72, 150, 400),
    ]);
    expect(blocks.filter((b) => b.kind === 'paragraph')).toHaveLength(2);
  });

  it('大字号短行识别为标题', () => {
    const blocks = analyze([
      line('第一章 绪论', 72, 100, 120, { fontSize: 18, bold: true }),
      line('这里是正文这里是正文这里是正文这里是正文', 72, 130, 400),
      line('继续正文继续正文继续正文继续正文继续', 72, 144, 400),
    ]);
    expect(blocks[0].kind).toBe('heading');
    expect(blocks[1].kind).toBe('paragraph');
  });

  it('项目符号识别为列表项', () => {
    const blocks = analyze([
      line('• 第一项内容', 72, 100, 200),
      line('• 第二项内容', 72, 116, 200),
    ]);
    expect(blocks.every((b) => b.kind === 'list-item')).toBe(true);
  });

  it('首行缩进被当作新段开始', () => {
    const blocks = analyze([
      line('前一段最后一行前一段最后一行前一段最后一行', 72, 100, 400),
      line('新段首行有缩进新段首行有缩进新段首行有缩', 93, 114, 379),
    ]);
    expect(blocks).toHaveLength(2);
  });
});

describe('detectHeadersFooters', () => {
  const makePage = (index: number) => {
    const { lines } = buildLines([
      line('某某公司 2024 年度报告', 72, 40, 200, { pageIndex: index }),
      line(`正文内容第 ${index} 页`, 72, 300, 300, { pageIndex: index }),
      line(String(index + 1), 300, 780, 20, { pageIndex: index }),
    ]);
    return { index, height: 842, lines };
  };

  it('跨页重复的页眉和页码被识别出来', () => {
    const pages = [0, 1, 2, 3].map(makePage);
    const result = detectHeadersFooters(pages);
    for (const page of pages) {
      expect(result.headerLineIds.get(page.index)?.size).toBe(1);
      expect(result.footerLineIds.get(page.index)?.size).toBe(1);
    }
  });

  it('正文不会被误判成页眉页脚', () => {
    const pages = [0, 1, 2, 3].map(makePage);
    const result = detectHeadersFooters(pages);
    const bodyId = pages[0].lines.find((l) => l.text.includes('正文内容'))?.id;
    expect(result.headerLineIds.get(0)?.has(bodyId ?? '')).not.toBe(true);
    expect(result.footerLineIds.get(0)?.has(bodyId ?? '')).not.toBe(true);
  });

  it('页数太少时不做判断', () => {
    const result = detectHeadersFooters([makePage(0), makePage(1)]);
    expect(result.headerLineIds.size).toBe(0);
  });
});

describe('OCR 来的页面（字号不可靠）', () => {
  const analyzeNoisy = (spans: ReturnType<typeof line>[]) => {
    const { lines } = buildLines(spans);
    const ctx = { pageIndex: 0, bodyFontSize: 10, order: 0, noisyFontSizes: true };
    return segmentRegions(lines, 595).regions.flatMap((region) =>
      buildBlocksForRegion(region, ctx),
    );
  };

  it('多级编号短行单独成标题，不和下一行正文粘在一起', () => {
    const blocks = analyzeNoisy([
      line('1.3.1 农业农村现代化', 72, 100, 120),
      line(
        '实现农业农村现代化是全面建设社会主义现代化国家的重大任务，需要将先进技术',
        72,
        114,
        400,
      ),
      line('装备、管理理念等引入农业，将基础设施和基本公共服务向农村延伸覆盖。', 72, 128, 400),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph']);
    expect(blocks[0]?.kind === 'heading' ? blocks[0].level : null).toBe(3);
  });

  it('OCR 框左边界抖动，不按缩进分段，只看上一行是否提前收尾', () => {
    const blocks = analyzeNoisy([
      line(
        '第五级，信息系统受到破坏后，会对国家安全造成特别严重损害。第五级信息系统',
        47,
        100,
        420,
      ),
      line('使用单位应当依据国家管理规范、技术标准和业务特殊安全需求进行保护，并', 25, 114, 442),
      line('对该级信息系统信息安全等级保护工作进行专门监督、检查。', 40, 128, 280),
      line('《信息安全技术 网络安全等级保护基本要求》规定了不同级别的等级保护对', 46, 142, 421),
      line('象应具备的基本安全保护能力。', 40, 156, 140),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph']);
    expect(blocks[0]?.kind === 'paragraph' ? blocks[0].lines.length : 0).toBe(3);
  });

  it('项目符号行的续行不拆开', () => {
    const blocks = analyzeNoisy([
      line(
        '● 可管理性：风险责任人(或责任组织)管理风险发生或影响的容易程度。如果容易管',
        45,
        100,
        421,
      ),
      line('理，可管理性就高。', 77, 114, 88),
      line(
        '● 可控性：风险责任人(或责任组织)能够控制风险后果的程度。如果后果很容易控制，',
        43,
        128,
        416,
      ),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['list-item', 'list-item']);
    expect(blocks[0]?.kind === 'list-item' ? blocks[0].lines.length : 0).toBe(2);
  });

  it('字号只大 17% 的正文行不算标题：OCR 估的字号页与页之间就差这么多', () => {
    const blocks = analyzeNoisy([
      line('备将获取的数据记录到电子健康文件中，方便病人或医生查阅。', 72, 100, 400, {
        fontSize: 11.7,
      }),
    ]);
    expect(blocks[0]?.kind).toBe('paragraph');
  });
});
