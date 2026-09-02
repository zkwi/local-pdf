/**
 * 把 PaddleOCR 官方模型下载到 public/ocr-models/，用于自托管 / 完全离线部署。
 *
 *   node scripts/download-ocr-models.mjs           # tiny（默认档位，约 6 MB）
 *   node scripts/download-ocr-models.mjs small     # small（高精度档位，约 30 MB）
 *   node scripts/download-ocr-models.mjs all
 *
 * 每个文件都校验 SHA-256，对不上直接失败退出，不把来源不明的模型留在目录里。
 * 哈希与 src/core/ocr/paddle-models.ts 保持一致。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE =
  'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/';

const MODELS = {
  tiny: [
    [
      'PP-OCRv6_tiny_det',
      1_792_000,
      'ff6ab415b0a6e0c488550f2fb5d5046f1719848df220b2dc21b56402a65bc05d',
    ],
    [
      'PP-OCRv6_tiny_rec',
      4_526_080,
      '1e13b22717b1edd89d4cde4fda272b6c17d5b505c97c2baea99da1a3a2d54b29',
    ],
  ],
  small: [
    [
      'PP-OCRv6_small_det',
      9_891_840,
      'd218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4',
    ],
    [
      'PP-OCRv6_small_rec',
      21_319_680,
      'd267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1',
    ],
  ],
};

const tier = process.argv[2] ?? 'tiny';
const wanted = tier === 'all' ? [...MODELS.tiny, ...MODELS.small] : MODELS[tier];
if (wanted === undefined) {
  console.error(`未知档位 "${tier}"，可选 tiny / small / all`);
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'ocr-models');
mkdirSync(outDir, { recursive: true });

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
let failed = false;

for (const [name, bytes, hash] of wanted) {
  const file = `${name}_onnx_infer.tar`;
  const target = join(outDir, file);

  if (existsSync(target) && sha256(readFileSync(target)) === hash) {
    console.log(`已存在且校验通过：${file}`);
    continue;
  }

  process.stdout.write(`下载 ${file}（${(bytes / 1024 / 1024).toFixed(1)} MB）… `);
  try {
    const response = await fetch(`${BASE}${file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const actual = sha256(buffer);
    if (actual !== hash) {
      console.log('失败');
      console.error(`  SHA-256 不匹配：期望 ${hash}\n  实际 ${actual}`);
      failed = true;
      continue;
    }
    writeFileSync(target, buffer);
    console.log('完成');
  } catch (error) {
    console.log('失败');
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    if (existsSync(target)) unlinkSync(target);
    failed = true;
  }
}

if (failed) {
  console.error('\n有模型没有下载成功，请检查网络后重试。');
  process.exit(1);
}
console.log(`\n模型已就位：${outDir}\n应用会优先使用这里的模型，不再访问官方源。`);
