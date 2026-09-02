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
    return { index, width: 595, height: 842, lines };
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

  it('扫描件页眉页脚的位置每页抖几 pt，仍然认得出来', () => {
    const pages = [0, 1, 2, 3].map((index) => {
      const jitter = [0, 7, -5, 9][index];
      const { lines } = buildLines([
        line('金融产品深度报告', 420, 40 + jitter, 100, { pageIndex: index }),
        line(`正文内容第 ${index} 页`, 72, 300, 300, { pageIndex: index }),
        line('请务必阅读正文之后的免责条款和声明', 72, 800 + jitter, 220, { pageIndex: index }),
      ]);
      return { index, width: 595, height: 842, lines };
    });
    const result = detectHeadersFooters(pages);
    expect(result.headerLineIds.get(1)?.size).toBe(1);
    expect(result.footerLineIds.get(1)?.size).toBe(1);
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

  it('中文提前收尾的行就是段末，不必等句号："接口名称：无" 一行一项', () => {
    const blocks = analyzeNoisy([
      line('使用“AI生成”提示文字，位于图片、视频下方的内容显式标识，说明如下', 72, 100, 400),
      line('是否接入第三方模块：□是☑否', 103, 124, 168),
      line('接口名称：无', 129, 148, 68),
      line('提供方名称：无', 129, 172, 79),
      line('公司名称：上海砾捷信息科技有限公司', 129, 196, 189),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(new Array(5).fill('paragraph'));
  });

  it('西文提前收尾但没有句号的行仍当作续行', () => {
    const blocks = analyzeNoisy([
      line('The quick brown fox jumps over the lazy dog and keeps running', 72, 100, 400),
      line('across the field', 72, 114, 100),
      line('until it reaches the river bank where it finally stops to rest', 72, 128, 400),
    ]);
    expect(blocks).toHaveLength(1);
  });

  it('比项目符号还靠左的下一行不是列表项的续行', () => {
    const blocks = analyzeNoisy([
      line('• 隐式标识内容截图', 105, 100, 120),
      line('图片', 81, 122, 26),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['list-item', 'paragraph']);
  });

  it('编号 + 粗体（按墨迹量出来的）的短行是标题，不是列表项', () => {
    const blocks = analyzeNoisy([
      line('1. 显式标识材料', 80, 100, 99, { bold: true }),
      line('使用“AI生成”提示文字，位于图片、视频下方的内容显式标识。', 79, 124, 300),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph']);
  });
});

describe('栏间空隙：基线对齐、间距不到两个字宽的两栏也要拆开', () => {
  it('双栏正文按栏间空白拆成左右两栏', () => {
    const spans = [
      ...Array.from({ length: 8 }, (_, i) =>
        line(`左栏第${i}行左栏正文左栏正文左栏正文`, 60, 120 + i * 14, 200),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        line(`右栏第${i}行右栏正文右栏正文右栏正文`, 272, 120 + i * 14, 200),
      ),
    ];
    const { lines, gutters } = buildLines(spans);
    expect(lines).toHaveLength(16);
    expect(gutters).toHaveLength(1);
    const result = segmentRegions(lines, 595, undefined, gutters);
    expect(result.columnCount).toBe(2);
    const order = result.regions.flatMap((r) => r.lines.map((l) => l.text));
    expect(order.slice(0, 8).every((t) => t.startsWith('左栏'))).toBe(true);
  });

  it('正文旁边的侧栏（短行）也隔开，跨栏的页脚不受影响', () => {
    const spans = [
      ...Array.from({ length: 8 }, (_, i) =>
        line(`正文第${i}行正文正文正文正文正文正文正文正文`, 60, 120 + i * 14, 300),
      ),
      ...Array.from({ length: 6 }, (_, i) => line(`侧栏${i}`, 372, 120 + i * 14, 60)),
      line('敬请阅读末页的重要说明', 200, 800, 200),
    ];
    const { lines } = buildLines(spans, 595);
    expect(lines).toHaveLength(15);
    expect(lines.find((l) => l.text.startsWith('正文第0行'))?.text).not.toContain('侧栏');
  });

  it('通栏的脚注块和标题横穿空隙，空隙仍然成立', () => {
    const spans = [
      line('一个横跨整页的大标题一个横跨整页的大标题', 60, 90, 412, { fontSize: 18 }),
      ...Array.from({ length: 8 }, (_, i) =>
        line(`左栏第${i}行左栏正文左栏正文左栏正文`, 60, 120 + i * 14, 200),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        line(`右栏第${i}行右栏正文右栏正文右栏正文`, 272, 120 + i * 14, 200),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        line(
          `${i + 1} 通栏脚注通栏脚注通栏脚注通栏脚注通栏脚注通栏脚注通栏脚注`,
          60,
          300 + i * 8,
          412,
          {
            fontSize: 6,
          },
        ),
      ),
    ];
    const { lines, gutters } = buildLines(spans, 595);
    expect(gutters).toHaveLength(1);
    expect(lines.filter((l) => l.text.startsWith('左栏'))).toHaveLength(8);
    expect(lines.filter((l) => l.text.startsWith('右栏'))).toHaveLength(8);
  });

  it('数字表格的列间隙不算栏间空隙：一行仍是一行', () => {
    const spans = Array.from({ length: 8 }, (_, i) => [
      line(`项目${i}`, 60, 120 + i * 14, 60),
      line(`1,23${i}`, 130, 120 + i * 14, 40),
      line(`4,56${i}`, 180, 120 + i * 14, 40),
    ]).flat();
    const { lines } = buildLines(spans);
    expect(lines).toHaveLength(8);
    expect(lines[0].text).toContain('1,230');
  });

  it('脚注序号（小字号上标）留在它所在的行里', () => {
    const { lines } = buildLines([
      line('中国可再生能源总装机容量提前六年超额完成目标', 72, 100, 300),
      span({ text: '113', x: 372, baseline: 95.5, fontSize: 6 }),
      line('下一行正文下一行正文下一行正文下一行正文', 72, 114, 300),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toContain('113');
  });
});

describe('段落与标题的新规则', () => {
  const analyze = (spans: ReturnType<typeof line>[], noisy = false, bodyFontSize = 10) => {
    const { lines } = buildLines(spans);
    const ctx = { pageIndex: 0, bodyFontSize, order: 0, noisyFontSizes: noisy };
    return segmentRegions(lines, 595).regions.flatMap((region) =>
      buildBlocksForRegion(region, ctx),
    );
  };

  it('原生中文提前收尾的行也是段末，不管下一行有没有缩进', () => {
    const blocks = analyze([
      line('甲方（辅导方）：陆雄杰', 72, 100, 130),
      line('乙方（家长方）：陈红丹（学生法定监护人）', 72, 114, 240),
      line('    甲乙双方本着平等自愿、协商一致的原则，就甲方为乙方子女提供', 92, 128, 380),
      line('辅导服务及相关费用结算事宜，达成如下协议：', 72, 142, 250),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
  });

  it('同一行高度上还有别的行时，粗体短行不是标题（表格里加粗的数值）', () => {
    const spans = [
      line('帐户号码', 60, 100, 60),
      line('1001258780269367', 200, 100, 120, { bold: true }),
      line('帐户类型', 60, 114, 60),
      line('孖展', 200, 114, 30, { bold: true }),
    ];
    const { lines } = buildLines(spans);
    const ctx = { pageIndex: 0, bodyFontSize: 10, order: 0, pageLines: lines };
    const blocks = segmentRegions(lines, 595).regions.flatMap((region) =>
      buildBlocksForRegion(region, ctx),
    );
    expect(blocks.some((b) => b.kind === 'heading')).toBe(false);
  });

  it('扫描公文里"一、培训时间"是标题，"（一）开班式"不是', () => {
    const blocks = analyze(
      [
        line('一、培训时间', 92, 100, 80),
        line('2026年5月22日—5月25日。', 92, 118, 160),
        line('（一）开班式', 92, 136, 80),
        line('时间：2026年5月22日上午9:00', 92, 154, 180),
      ],
      true,
    );
    expect(blocks[0].kind).toBe('heading');
    expect(blocks[0].kind === 'heading' ? blocks[0].level : 0).toBe(2);
    expect(blocks[1].kind).toBe('paragraph');
    expect(blocks[2].kind).toBe('paragraph');
  });

  it('字号只大一点的多行说明、以顿号收尾的行不是标题', () => {
    const blocks = analyze(
      [
        line('若投资者符合以下条件或有望索赔一定程度的投资差额等损失：(索赔条件', 72, 100, 400, {
          fontSize: 12,
        }),
        line('或是否胜诉仍需以法院生效裁判认定为准)：', 72, 116, 230, { fontSize: 12 }),
        line('1、证券营业部盖章的账户信息证明一份，（开户申请表或账户信息表、', 72, 140, 400, {
          fontSize: 12,
        }),
        line(
          '划重点：对账起止时间段或统计期间、开始日期与结束日期等对账单查询时间段',
          72,
          156,
          400,
        ),
        line('务必标明（详见模板）：从首笔买入之日打印至今；请严格按此点进行。', 72, 170, 400),
        line('第二步：', 72, 190, 40, { fontSize: 12 }),
      ],
      false,
      10.5,
    );
    expect(blocks.filter((b) => b.kind === 'heading').map((b) => b.lines[0].text)).toEqual([
      '第二步：',
    ]);
  });

  it('公文里首行缩进、续行顶格的编号段落是同一个列表项', () => {
    const blocks = analyze(
      [
        line('1.项目对象。该项目以本市全日制在校博士、硕士研究生及', 104, 100, 368, {
          fontSize: 16,
        }),
        line('三年级及以上本科生为主体。组织化选聘信念坚定、品学兼优、', 72, 128, 400, {
          fontSize: 16,
        }),
        line('乐于奉献的优秀学生到各领域兼职开展岗位锻炼或兼任基层团干部。', 72, 156, 380, {
          fontSize: 16,
        }),
        line('2.项目周期。该项目周期为1年。', 104, 184, 200, { fontSize: 16 }),
      ],
      false,
      16,
    );
    expect(blocks.map((b) => b.kind)).toEqual(['list-item', 'list-item']);
    expect(blocks[0].kind === 'list-item' ? blocks[0].lines.length : 0).toBe(3);
  });

  it('项目符号后面紧跟中文也算列表项', () => {
    const blocks = analyze([
      line('•若中考该科目成绩达到140分及以上，甲方收取全额预付费用', 72, 100, 330),
      line('•若中考该科目成绩低于135分，甲方需全额退还预付费用', 72, 114, 300),
    ]);
    expect(blocks.every((b) => b.kind === 'list-item')).toBe(true);
  });
});

describe('页边竖排的章节名', () => {
  const makePage = (index: number) => {
    const { lines } = buildLines([
      line(`正文内容第 ${index} 页正文内容正文内容`, 72, 300, 300, { pageIndex: index }),
      line('更多正文更多正文更多正文更多正文', 72, 314, 300, { pageIndex: index }),
      {
        ...span({ text: '第一章：总体建议书', x: 570, baseline: 400, pageIndex: index }),
        rotation: 270,
        bbox: { x: 570, y: 300, width: 10, height: 120 },
      },
    ]);
    return { index, width: 595, height: 842, lines };
  };

  it('跨页重复的旋转侧边文字归入页眉；每章不同的章节名在三页上重复就够', () => {
    const pages = [0, 1, 2, 3].map(makePage);
    const result = detectHeadersFooters(pages);
    for (const page of pages) {
      const sideId = page.lines.find((l) => l.text.startsWith('第一章'))?.id ?? '';
      expect(result.headerLineIds.get(page.index)?.has(sideId)).toBe(true);
    }
    // 十页的书，章节名只在前三页出现，仍算页眉
    const book = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
      const page = makePage(i);
      return i < 3
        ? page
        : { ...page, lines: page.lines.filter((l) => !l.text.startsWith('第一章')) };
    });
    const bookResult = detectHeadersFooters(book);
    const sideId = book[0].lines.find((l) => l.text.startsWith('第一章'))?.id ?? '';
    expect(bookResult.headerLineIds.get(0)?.has(sideId)).toBe(true);
  });
});

describe('OCR 页：本页自己的正文字号', () => {
  const analyzeDoc = (spans: ReturnType<typeof line>[], noisy: boolean) => {
    const { lines } = buildLines(spans);
    const flow = lines;
    const textSizes = (() => {
      const counts = new Map<number, number>();
      for (const l of flow) {
        if (l.text.trim().length < 15) continue;
        counts.set(l.fontSize, (counts.get(l.fontSize) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, n]) => n >= 3).map(([s]) => s);
    })();
    const ctx = {
      pageIndex: 0,
      bodyFontSize: 10.5,
      order: 0,
      noisyFontSizes: noisy,
      pageLines: flow,
      textSizes,
      lineRight: Math.max(...flow.map((l) => l.bbox.x + l.bbox.width)),
    };
    return segmentRegions(lines, 595).regions.flatMap((region) =>
      buildBlocksForRegion(region, ctx),
    );
  };

  it('同一页里 16 号的通知正文和 10.5 号的附表：正文不因为比表格字大就成标题', () => {
    const body = Array.from({ length: 4 }, (_, i) =>
      line(
        `高等院校、政府部门、科研院所、科技孵化器、科技园区、创新平台等从事科技成果${i}`,
        72,
        100 + i * 24,
        430,
        {
          fontSize: 16,
        },
      ),
    );
    const cells = Array.from({ length: 10 }, (_, i) => [
      line(`9:${i}0-12:00`, 72, 260 + i * 14, 60, { fontSize: 10.5 }),
      line(`课程${i}`, 200, 260 + i * 14, 40, { fontSize: 10.5 }),
      line(`单位${i}`, 320, 260 + i * 14, 40, { fontSize: 10.5 }),
    ]).flat();
    const blocks = analyzeDoc([...body, ...cells], true);
    const bodyBlocks = blocks.filter((b) => 'lines' in b && b.lines[0].fontSize === 16);
    expect(bodyBlocks.length).toBeGreaterThan(0);
    expect(bodyBlocks.every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('只有两三行短行的区域也按本页文字右边界判短行："地点：××" 不和下一行粘住', () => {
    const blocks = analyzeDoc(
      [
        line(
          '为深入学习贯彻关于科技创新和产业创新深度融合的重要论述落实工作报告目标要求',
          72,
          100,
          430,
        ),
        line(
          '加快构建科技创新与产业创新一体谋划的新格局，着力培养一批政治坚定的青年',
          72,
          114,
          430,
        ),
        line('地点：上海市团校（上海市青年管理干部学院）一号楼', 72, 200, 300),
        line('（二）课程安排', 72, 214, 90),
      ],
      true,
    );
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
  });
});
