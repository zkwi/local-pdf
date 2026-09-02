import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { uniqueNames, zipBlobs } from '../src/ui/zip.ts';

describe('打包下载', () => {
  it('同名文件在扩展名前加序号', () => {
    expect(uniqueNames(['a.docx', 'a.docx', 'b', 'b', 'a.docx'])).toEqual([
      'a.docx',
      'a (2).docx',
      'b',
      'b (2)',
      'a (3).docx',
    ]);
  });

  it('只存储不压缩，内容原样，重名的各自保留', async () => {
    const zip = await zipBlobs([
      { name: 'x.txt', blob: new Blob(['hello']) },
      { name: 'x.txt', blob: new Blob(['world']) },
    ]);
    expect(zip.type).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['x (2).txt', 'x.txt']);
    expect(new TextDecoder().decode(files['x.txt'])).toBe('hello');
    expect(new TextDecoder().decode(files['x (2).txt'])).toBe('world');
  });
});
