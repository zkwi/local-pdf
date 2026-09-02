/**
 * 把运行时需要的静态资源复制到 public/：
 *
 * - pdf.js 的 CMap、标准字体、WASM → public/pdfjs/
 *   CJK 编码表缺失会直接导致中文 PDF 变乱码，而走 CDN 又和"文件不出本机"的定位冲突。
 * - ONNX Runtime 的 wasm → public/ort/
 *   PaddleOCR.js 打进来的 ORT 胶水代码和这份 wasm 必须是同一个版本，
 *   所以只认 node_modules 里这份，不走 CDN。
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
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

// ---------- ONNX Runtime（PaddleOCR 用） ----------
const ortSource = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const ortTarget = join(root, 'public', 'ort');
// SDK 打进去的是 ORT 默认构建（含 WebGPU 的 jsep 版），wasm 后端也从 jsep 版加载，
// 非 jsep 那对文件它根本不会去请求
const ORT_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

if (!existsSync(ortSource)) {
  console.warn('找不到 onnxruntime-web，OCR 将不可用，请先 npm install');
} else {
  mkdirSync(ortTarget, { recursive: true });
  for (const file of ORT_FILES) {
    const from = join(ortSource, file);
    if (!existsSync(from)) {
      console.warn(`跳过缺失文件：${file}`);
      continue;
    }
    copyFileSync(from, join(ortTarget, file));
    console.log(`已复制 ort/${file}`);
  }
}
