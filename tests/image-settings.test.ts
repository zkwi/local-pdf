import { describe, expect, it } from 'vitest';
import {
  changedFromDefaults,
  fixSettings,
  IMAGE_DEFAULTS,
  moreChanged,
  toJob,
} from '../src/ui/image-settings.ts';
import type { ImageSettings } from '../src/ui/image-settings.ts';

/** 一份把所有字段都改过的设置：看每个工具到底只用了哪几项 */
const everything: ImageSettings = {
  quality: 'small',
  target: true,
  targetKb: 200,
  output: 'webp',
  color: '#000000',
  resize: 'exact',
  size: 800,
  percent: 25,
  exactWidth: 300,
  exactHeight: 200,
  fit: 'contain',
  dpi: 300,
};

describe('界面设置 → 处理参数', () => {
  it('压缩只用画质、指定大小和输出格式，其余固定', () => {
    const job = toJob(everything, 'compress-images');
    expect(job).toMatchObject({
      quality: 'small',
      targetBytes: 200 * 1024,
      output: 'webp',
      resize: 'none',
      dpi: 0,
      color: '#ffffff',
      background: 'keep',
      keepUnchanged: false,
    });
    expect(toJob({ ...everything, target: false }, 'compress-images').targetBytes).toBe(0);
  });

  it('转换只用目标格式、画质和底色，不缩放、不限大小', () => {
    expect(toJob(everything, 'convert-images')).toMatchObject({
      output: 'webp',
      quality: 'small',
      color: '#000000',
      targetBytes: 0,
      resize: 'none',
      dpi: 0,
      keepUnchanged: true,
    });
  });

  it('改尺寸只用尺寸和 DPI，保持格式、高清画质', () => {
    expect(toJob(everything, 'resize-images')).toMatchObject({
      resize: 'exact',
      exactWidth: 300,
      exactHeight: 200,
      fit: 'contain',
      dpi: 300,
      output: 'keep',
      quality: 'high',
      targetBytes: 0,
      keepUnchanged: true,
    });
  });
});

describe('读出来的旧设置', () => {
  it('不认识的枚举、越界的数字换回该工具的默认值', () => {
    const stale = {
      ...IMAGE_DEFAULTS['convert-images'],
      output: 'keep',
      resize: 'none',
      targetKb: 5,
      color: 'red',
      dpi: 123,
      quality: 'ultra',
    } as unknown as ImageSettings;
    const fixed = fixSettings('convert-images')(stale);
    // 转换没有「原格式」这一项
    expect(fixed.output).toBe('jpeg');
    expect(fixed.resize).toBe('long');
    expect(fixed.targetKb).toBe(10);
    expect(fixed.color).toBe('#ffffff');
    expect(fixed.dpi).toBe(0);
    expect(fixed.quality).toBe('high');
    // 压缩可以保持原格式
    expect(fixSettings('compress-images')({ ...stale, output: 'keep' }).output).toBe('keep');
  });

  it('数字是 NaN 时用默认值', () => {
    const fixed = fixSettings('resize-images')({
      ...IMAGE_DEFAULTS['resize-images'],
      size: Number.NaN,
    });
    expect(fixed.size).toBe(1920);
  });
});

describe('「更多选项」和「恢复默认」', () => {
  it('收起的那一项改过才亮点', () => {
    const compress = IMAGE_DEFAULTS['compress-images'];
    expect(moreChanged(compress, 'compress-images')).toBe(false);
    expect(moreChanged({ ...compress, output: 'png' }, 'compress-images')).toBe(true);
    // 画质在主设置栏里，不算收起的那一项
    expect(moreChanged({ ...compress, quality: 'small' }, 'compress-images')).toBe(false);
    expect(moreChanged({ ...compress, dpi: 300 }, 'resize-images')).toBe(true);
  });

  it('只改了没生效的数值不算改过', () => {
    const compress = IMAGE_DEFAULTS['compress-images'];
    // 没选「指定大小」时改 KB 数值、在压缩里改 DPI，结果都一样
    expect(changedFromDefaults({ ...compress, targetKb: 900 }, 'compress-images')).toBe(false);
    expect(changedFromDefaults({ ...compress, dpi: 300 }, 'compress-images')).toBe(false);
    expect(changedFromDefaults({ ...compress, target: true }, 'compress-images')).toBe(true);
  });
});
