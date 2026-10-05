/**
 * 拖进来的文件夹：浏览器只在 drop 事件里给目录条目，要同步取出来再异步逐层读。
 * 文件在文件夹里的相对路径记在 WeakMap 里，图片工具打包时按原目录结构放；其他工具只当多选了一批文件。
 */

const relativePaths = new WeakMap<File, string>();

/** 拖进文件夹或用「选择文件夹」选的文件，返回 a/b/c.png 这样的相对路径；单独选的文件返回空串 */
export function relativePathOf(file: File): string {
  return relativePaths.get(file) ?? file.webkitRelativePath ?? '';
}

/** 一次最多展开这么多个文件，误拖进整个盘符时不至于卡死 */
const MAX_FILES = 5000;

/** 系统生成的杂项文件和隐藏文件不要 */
function ignored(name: string): boolean {
  return name.startsWith('.') || /^(thumbs\.db|desktop\.ini|__macosx)$/i.test(name);
}

const byName = (a: FileSystemEntry, b: FileSystemEntry): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (out.length >= MAX_FILES || ignored(entry.name)) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    relativePaths.set(file, entry.fullPath.replace(/^\/+/, ''));
    out.push(file);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries 一次只给一批（Chrome 每批 100 个），读到空为止
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }
  for (const child of children.sort(byName)) await walk(child, out);
}

/**
 * drop 事件里调用：没有文件夹就同步返回文件列表；有文件夹则返回 Promise，展开后的文件按名字排好。
 */
export function droppedFiles(data: DataTransfer | null): File[] | Promise<File[]> {
  if (data === null) return [];
  const files = [...data.files];
  const items = [...data.items].filter((item) => item.kind === 'file');
  const entries = items.map((item) =>
    typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
  );
  if (!entries.some((entry) => entry?.isDirectory === true)) return files;
  return (async () => {
    const out: File[] = [];
    for (const [i, entry] of entries.entries()) {
      if (entry === null) {
        if (files[i] !== undefined) out.push(files[i]);
      } else {
        await walk(entry, out);
      }
    }
    return out;
  })();
}
