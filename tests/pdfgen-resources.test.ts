import { describe, expect, it } from 'vitest';
import { replaceUnsupportedCharacters, encodeUcs2 } from '../src/core/pdfgen/fonts.ts';
import {
  isLocalImageSource,
  unsupportedImageFormat,
  waitForResource,
} from '../src/core/pdfgen/resources.ts';

describe('文档排版的资源边界', () => {
  it('只允许本地图片，拒绝网络、相对地址和主动内容', () => {
    for (const src of [
      'data:image/png;base64,AA==',
      'data:image/jpeg;base64,AA==',
      'blob:http://localhost/image',
    ])
      expect(isLocalImageSource(src)).toBe(true);
    for (const src of [
      'https://example.com/pixel',
      '//example.com/image',
      '/private',
      'file:///image',
      'data:text/html,test',
      'data:image/svg+xml,<svg/>',
    ])
      expect(isLocalImageSource(src)).toBe(false);
    expect(unsupportedImageFormat('data:image/x-emf;base64,AA==')).toBe('EMF');
    expect(unsupportedImageFormat('data:image/wmf;base64,AA==')).toBe('WMF');
  });

  it('解码一直不结束时也能取消，已取消的信号同样生效', async () => {
    const controller = new AbortController();
    const pending = waitForResource(new Promise(() => {}), controller.signal);
    controller.abort();
    await expect(pending).rejects.toHaveProperty('name', 'AbortError');
    await expect(waitForResource(Promise.resolve(1), controller.signal)).rejects.toHaveProperty(
      'name',
      'AbortError',
    );
  });

  it('资源超时后释放等待，正常值和失败保持原样', async () => {
    await expect(waitForResource(new Promise(() => {}), undefined, 10)).rejects.toHaveProperty(
      'name',
      'TimeoutError',
    );
    await expect(waitForResource(Promise.resolve(42))).resolves.toBe(42);
    await expect(waitForResource(Promise.reject(new Error('broken')))).rejects.toThrow('broken');
  });
});

describe('补充平面字符', () => {
  it('一个完整字符只占一个位置，不吞掉周围文字', () => {
    expect(replaceUnsupportedCharacters('甲𠮷乙😀丙\ud800丁')).toEqual({
      text: '甲□乙□丙□丁',
      count: 3,
    });
    expect(replaceUnsupportedCharacters('中文 ABC')).toEqual({ text: '中文 ABC', count: 0 });
    expect(encodeUcs2('A𠮷B')).toBe('<004125a10042>');
  });
});
