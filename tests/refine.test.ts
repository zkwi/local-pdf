import { describe, expect, it } from 'vitest';
import type { PrimitiveTextSpan } from '../src/core/contracts/primitives.ts';
import type { InkStats } from '../src/core/ocr/refine.ts';
import { isOcrNoise, markBoldByInk } from '../src/core/ocr/refine.ts';
import { span } from './helpers.ts';

const ocr = (
  text: string,
  extra: Partial<Pick<PrimitiveTextSpan, 'confidence' | 'rotation' | 'vertical'>> = {},
): PrimitiveTextSpan => ({
  ...span({ text, x: 72, baseline: 100 }),
  source: 'ocr',
  confidence: 1,
  ...extra,
});

const ink = (density: number, red = 0, total = 2000): InkStats => ({ density, red, ink: total });

describe('isOcrNoise', () => {
  it('置信度很低的短片段是噪点，长的正文行再低也留着', () => {
    expect(isOcrNoise(ocr('地', { confidence: 0.15 }), ink(0.2), true)).toBe(true);
    expect(isOcrNoise(ocr('山l', { confidence: 0.5 }), ink(0.2), true)).toBe(true);
    expect(
      isOcrNoise(ocr('这一行正文认得很差但还是正文', { confidence: 0.3 }), ink(0.2), true),
    ).toBe(false);
  });

  it('红色墨迹（公章）上认不准的字、歪着的字是噪点；红头标题、行情表里的红字不是', () => {
    expect(isOcrNoise(ocr('信息科', { confidence: 0.97, rotation: 270 }), ink(0, 1), true)).toBe(
      true,
    );
    expect(isOcrNoise(ocr('上海砾捷信息科技', { confidence: 0.7 }), ink(0, 0.9), true)).toBe(true);
    expect(isOcrNoise(ocr('某某市人民政府文件', { confidence: 0.98 }), ink(0.3, 0.95), true)).toBe(
      false,
    );
    expect(isOcrNoise(ocr('PSTG', { confidence: 0.95 }), ink(0.2, 1), true)).toBe(false);
    expect(isOcrNoise(ocr('-13.4%', { confidence: 0.99 }), ink(0.2, 1), true)).toBe(false);
    // 整页旋转的页面上，红色旋转字也不动
    expect(isOcrNoise(ocr('有限公司', { rotation: 270 }), ink(0, 1), false)).toBe(false);
    // 正文行被公章压到一角：红色不到六成，照常保留
    expect(isOcrNoise(ocr('批处加盖公章', { confidence: 0.96 }), ink(0.29, 0.5), true)).toBe(false);
  });

  it('旋转的短片段只在页面基本是横排时算噪点，整页旋转的页面不动', () => {
    expect(isOcrNoise(ocr('业', { rotation: 90 }), ink(0.2), true)).toBe(true);
    expect(isOcrNoise(ocr('业', { rotation: 90 }), ink(0.2), false)).toBe(false);
    expect(isOcrNoise(ocr('这是一整行旋转的文字', { rotation: 90 }), ink(0.2), true)).toBe(false);
  });

  it('量不到墨迹时只按置信度和旋转判', () => {
    expect(isOcrNoise(ocr('正常的一行', { confidence: 0.9 }), null, true)).toBe(false);
    expect(isOcrNoise(ocr('封', { confidence: 0.2 }), null, true)).toBe(true);
  });
});

describe('markBoldByInk', () => {
  it('密度明显高于本页中文正文的行标粗体；基准不受西文代码行拉低；两个字的不判', () => {
    const spans = [
      ocr('这是正文第一行的内容'),
      ocr('这是正文第二行的内容'),
      ocr('这是正文第三行的内容'),
      ocr('这是正文第四行的内容'),
      ocr('这是正文第五行的内容'),
      ocr('这是正文第六行笔画偏多'),
      ocr('{"Label": "2", "ContentProducer"}'),
      ocr('"c884950d6f1a44a6bf2194b8d91e4113"'),
      ocr('"ReservedCode1": "ec26e617d6052946"'),
      ocr('"PropagateID": "0ee2eb26e56ea5fdbd"'),
      ocr('"ContentPropagator": "405"'),
      ocr('服务提供者基本信息'),
      ocr('视频'),
    ];
    const inks = [
      ink(0.2),
      ink(0.21),
      ink(0.22),
      ink(0.23),
      ink(0.24),
      ink(0.27),
      ink(0.08),
      ink(0.08),
      ink(0.09),
      ink(0.07),
      ink(0.08),
      ink(0.3),
      ink(0.36),
    ];
    const bold = markBoldByInk(spans, inks).map((s) => s.bold);
    expect(bold).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it('可比的行太少时不判粗体', () => {
    const spans = [ocr('这是正文的一行'), ocr('这是标题的一行')];
    const out = markBoldByInk(spans, [ink(0.2), ink(0.4)]);
    expect(out.map((s) => s.bold)).toEqual([false, false]);
  });
});
