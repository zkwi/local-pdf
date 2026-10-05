import { crc32 } from '../core/util/crc32.ts';

export interface ZipEntry {
  readonly name: string;
  readonly blob: Blob;
}

/** 同名文件加 " (2)"、" (3)" 后缀，放在扩展名前面 */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0
      ? `${name.slice(0, dot)} (${count + 1})${name.slice(dot)}`
      : `${name} (${count + 1})`;
  });
}

/** 逐块读 Blob 算 CRC，不一次把大文件读进内存 */
const CRC_CHUNK = 8 * 1024 * 1024;

async function blobCrc(blob: Blob): Promise<number> {
  let crc = 0;
  for (let offset = 0; offset < blob.size; offset += CRC_CHUNK) {
    const chunk = new Uint8Array(await blob.slice(offset, offset + CRC_CHUNK).arrayBuffer());
    crc = crc32(chunk, crc);
  }
  return crc;
}

/** zip 里的修改时间是 DOS 格式：两秒精度，从 1980 年算起 */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date:
      ((Math.max(1980, date.getFullYear()) - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

/** zip 格式里 32 位的大小和偏移、16 位的条目数（不写 ZIP64），超了就报错让界面提示逐个下载 */
const ZIP_LIMIT = 0xffffffff;

/**
 * 把几份结果打成一个 zip。docx、pdf、图片本身都已经压缩过，这里只存储不再压缩。
 * 文件头自己写，数据直接引用原来的 Blob：浏览器拼接 Blob 时不复制内容，
 * 内存里同时只有正在算 CRC 的那一块，几百 MB 的批量结果也不会翻倍占用内存。
 * 文件名含非 ASCII 字符时打上 UTF-8 标记，Windows 资源管理器和 macOS 解压都认。
 */
export async function zipBlobs(entries: readonly ZipEntry[]): Promise<Blob> {
  const names = uniqueNames(entries.map((e) => e.name));
  if (entries.length > 0xffff) throw new Error('too many entries for a zip');
  const encoder = new TextEncoder();
  const stamp = dosDateTime(new Date());
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [i, entry] of entries.entries()) {
    const name = encoder.encode(names[i]);
    // 非 ASCII 文件名：通用标志第 11 位表示 UTF-8
    const flags = name.length !== names[i].length ? 0x0800 : 0;
    const size = entry.blob.size;
    const crc = await blobCrc(entry.blob);
    if (offset + 30 + name.length + size > ZIP_LIMIT) throw new Error('zip too large');

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const record = new Uint8Array(46 + name.length);
    const cv = new DataView(record.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    record.set(name, 46);

    parts.push(local as BlobPart, entry.blob);
    central.push(record);
    offset += local.length + size;
  }
  const directorySize = central.reduce((sum, record) => sum + record.length, 0);
  if (offset + directorySize > ZIP_LIMIT) throw new Error('zip too large');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end as BlobPart], {
    type: 'application/zip',
  });
}

export function triggerDownload(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}

/** 打包后触发下载；对象 URL 等浏览器接手后再回收 */
export async function downloadAsZip(entries: readonly ZipEntry[], zipName: string): Promise<void> {
  const url = URL.createObjectURL(await zipBlobs(entries));
  triggerDownload(url, zipName);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
