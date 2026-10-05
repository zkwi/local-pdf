import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/core/util/crc32.ts';
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

  it('中文文件名带 UTF-8 标记、目录结构原样保留，空文件也能打包', async () => {
    const zip = await zipBlobs([
      { name: '相册/2024/照片.jpg', blob: new Blob([new Uint8Array([1, 2, 3, 4])]) },
      { name: 'empty.txt', blob: new Blob([]) },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['empty.txt', '相册/2024/照片.jpg']);
    expect([...files['相册/2024/照片.jpg']]).toEqual([1, 2, 3, 4]);
    expect(files['empty.txt'].length).toBe(0);
    // 第一个本地文件头的通用标志：中文名打了 UTF-8 位，CRC 与内容一致
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(view.getUint32(14, true)).toBe(crc32(new Uint8Array([1, 2, 3, 4])));
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
