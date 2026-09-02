import { describe, expect, it } from 'vitest';
import type { ConversionProgress } from '../src/core/contracts/report.ts';
import { estimateRemainingMs, formatClock, pushSample } from '../src/ui/eta.ts';
import type { PageSample } from '../src/ui/eta.ts';

const progress = (pageIndex: number, totalPages: number): ConversionProgress => ({
  stage: 'extracting',
  pageIndex,
  totalPages,
  fraction: 0.3,
  key: 'extracting',
});

/** 从第 0 页起每页固定耗时 perPageMs，记 count 个采样点 */
function samplesAt(perPageMs: number, count: number): readonly PageSample[] {
  let s: readonly PageSample[] = [];
  for (let i = 0; i < count; i++) s = pushSample(s, i, i * perPageMs);
  return s;
}

describe('pushSample', () => {
  it('同一页只记一次', () => {
    let s = pushSample([], 0, 0);
    s = pushSample(s, 0, 50);
    expect(s).toHaveLength(1);
  });

  it('只留最近一分钟；页很慢时至少留 4 个点', () => {
    // 每秒一页跑 200 秒：只剩最近 60 秒的 61 个点
    const fast = samplesAt(1000, 200);
    expect(fast).toHaveLength(61);
    expect(fast[0]?.page).toBe(139);
    // 每页 30 秒：一分钟窗口里只有 3 个点，仍保留 4 个
    const slow = samplesAt(30000, 8);
    expect(slow).toHaveLength(4);
    expect(slow[0]?.page).toBe(4);
  });
});

describe('estimateRemainingMs', () => {
  it('数据不够或不在逐页阶段时不估', () => {
    expect(estimateRemainingMs(progress(3, 100), samplesAt(2000, 3), 6000)).toBeNull();
    // 跨度不到 5 秒
    expect(estimateRemainingMs(progress(3, 100), samplesAt(100, 10), 1000)).toBeNull();
    expect(
      estimateRemainingMs(
        { stage: 'writing', fraction: 0.9, key: 'writing-docx' },
        samplesAt(2000, 10),
        20000,
      ),
    ).toBeNull();
  });

  it('按最近的页速估算，扣掉当前页已用时间', () => {
    // 每页 2 秒，已完成 10 页，共 100 页
    const s = samplesAt(2000, 11);
    expect(estimateRemainingMs(progress(10, 100), s, 20000)).toBe(90 * 2000);
    expect(estimateRemainingMs(progress(10, 100), s, 21000)).toBe(90 * 2000 - 1000);
  });

  it('快页之后接上扫描页，估计跟着最近一分钟的慢速走', () => {
    let s = samplesAt(100, 30);
    for (let i = 30; i < 60; i++) s = pushSample(s, i, 3000 + (i - 30) * 3000);
    const now = 3000 + 29 * 3000;
    expect(estimateRemainingMs(progress(59, 100), s, now)).toBe((100 - 59) * 3000);
  });

  it('快页（每秒七八页）跑够 5 秒后也能给出估计', () => {
    const s = samplesAt(135, 180);
    const eta = estimateRemainingMs(progress(179, 236), s, 179 * 135);
    expect(eta).not.toBeNull();
    expect(eta).toBeCloseTo((236 - 179) * 135, 0);
  });
});

describe('formatClock', () => {
  it('分:秒，超过一小时带小时', () => {
    expect(formatClock(7000)).toBe('0:07');
    expect(formatClock(754000)).toBe('12:34');
    expect(formatClock(3723000)).toBe('1:02:03');
  });
});
