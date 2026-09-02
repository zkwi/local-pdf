/**
 * 把 pdf.js 需要的静态资源复制到 public/pdfjs/：CMap、标准字体、WASM。
 * CJK 编码表缺失会直接导致中文 PDF 变乱码，而走 CDN 又和"文件不出本机"的定位冲突。
 *
 * ONNX Runtime 的 wasm 不在这里复制：它有 26.5 MiB，超过 Cloudflare Pages 等静态托管
 * 25 MiB 的单文件上限，默认按精确版本号从 jsDelivr 加载；想自托管用 npm run ocr-runtime。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- pdf.js ----------
const pdfjsSource = join(root, 'node_modules', 'pdfjs-dist');
const pdfjsTarget = join(root, 'public', 'pdfjs');
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

if (!existsSync(pdfjsSource)) {
  console.error('找不到 pdfjs-dist，请先运行 npm install');
  process.exit(1);
}

mkdirSync(pdfjsTarget, { recursive: true });
for (const dir of PDFJS_DIRS) {
  const from = join(pdfjsSource, dir);
  const to = join(pdfjsTarget, dir);
  if (!existsSync(from)) {
    console.warn(`跳过缺失目录：${dir}`);
    continue;
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`已复制 pdfjs/${dir}`);
}
