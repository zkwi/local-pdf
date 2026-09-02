/**
 * 把 ONNX Runtime 的 wasm 复制到 public/ort/，让 OCR 运行时完全同源、不访问 jsDelivr。
 * 只在托管方允许 26.5 MiB 单文件时使用（Cloudflare Pages 上限 25 MiB，不行）。
 * 应用启动 OCR 时会探测 public/ort/ 是否存在，存在就优先用。
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const target = join(root, 'public', 'ort');
// SDK 打进去的是 ORT 默认构建（含 WebGPU 的 jsep 版），wasm 后端也从 jsep 版加载
const FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

if (!existsSync(source)) {
  console.error('找不到 onnxruntime-web，请先 npm install');
  process.exit(1);
}
mkdirSync(target, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(source, file), join(target, file));
  console.log(`已复制 ort/${file}`);
}
console.log('OCR 运行时已自托管到 public/ort/，应用会优先使用它。');
