import { zipSync } from 'fflate';
import type { Zippable } from 'fflate';

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

/**
 * 把几份结果打成一个 zip。docx、pdf、zip 本身都已经压缩过，这里只存储不再压缩，
 * 主线程上几百 MB 也就是一次内存拷贝的时间。
 */
export async function zipBlobs(entries: readonly ZipEntry[]): Promise<Blob> {
  const names = uniqueNames(entries.map((e) => e.name));
  const files: Zippable = {};
  for (const [i, entry] of entries.entries()) {
    files[names[i]] = [new Uint8Array(await entry.blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(files) as BlobPart], { type: 'application/zip' });
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
