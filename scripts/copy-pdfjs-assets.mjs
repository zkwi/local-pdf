/**
 * 把 pdf.js 需要的静态资源复制到 public/pdfjs/。
 * 这些资源必须自托管：CJK 编码表缺失会直接导致中文 PDF 变乱码，
 * 而走 CDN 又和"文件不出本机"的定位冲突。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'pdfjs-dist');
const target = join(root, 'public', 'pdfjs');

const DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

if (!existsSync(source)) {
  console.error('找不到 pdfjs-dist，请先运行 npm install');
  process.exit(1);
}

mkdirSync(target, { recursive: true });
for (const dir of DIRS) {
  const from = join(source, dir);
  const to = join(target, dir);
  if (!existsSync(from)) {
    console.warn(`跳过缺失目录：${dir}`);
    continue;
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`已复制 ${dir}`);
}
