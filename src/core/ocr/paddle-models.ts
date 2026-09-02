import type { OcrLanguage, OcrQuality } from '../contracts/options.ts';
import { languageSpec } from './languages.ts';

/**
 * PaddleOCR 官方模型清单。URL、大小和 SHA-256 都是 2026-09-01 实测值，
 * scripts/download-ocr-models.mjs 用同一份数据做校验。
 */
export interface PaddleModelSpec {
  readonly name: string;
  readonly officialUrl: string;
  readonly bytes: number;
  readonly sha256: string;
}

const OFFICIAL_BASE =
  'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/';

function spec(name: string, bytes: number, sha256: string): PaddleModelSpec {
  return { name, officialUrl: `${OFFICIAL_BASE}${name}_onnx_infer.tar`, bytes, sha256 };
}

export const PADDLE_MODELS = {
  'PP-OCRv6_tiny_det': spec(
    'PP-OCRv6_tiny_det',
    1_792_000,
    'ff6ab415b0a6e0c488550f2fb5d5046f1719848df220b2dc21b56402a65bc05d',
  ),
  'PP-OCRv6_tiny_rec': spec(
    'PP-OCRv6_tiny_rec',
    4_526_080,
    '1e13b22717b1edd89d4cde4fda272b6c17d5b505c97c2baea99da1a3a2d54b29',
  ),
  'PP-OCRv6_small_det': spec(
    'PP-OCRv6_small_det',
    9_891_840,
    'd218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4',
  ),
  'PP-OCRv6_small_rec': spec(
    'PP-OCRv6_small_rec',
    21_319_680,
    'd267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1',
  ),
} as const;

export type PaddleModelName = keyof typeof PADDLE_MODELS;

/** 模型在应用静态目录下的自托管位置（相对 assetBase） */
export const PADDLE_MODEL_DIR = 'ocr-models/';

export function localModelUrl(assetBase: string, model: PaddleModelSpec): string {
  return `${assetBase}${PADDLE_MODEL_DIR}${model.name}_onnx_infer.tar`;
}

export interface PaddleModelSelection {
  readonly det: PaddleModelSpec;
  readonly rec: PaddleModelSpec;
  readonly lang: 'ch' | 'chinese_cht' | 'en' | 'japan';
  readonly quality: OcrQuality;
  readonly label: string;
  readonly totalBytes: number;
}

/**
 * 档位 → 模型。PP-OCRv6 一个模型覆盖中/英/日等 50 种语言，lang 只影响 SDK 内部选型；
 * tiny 不支持日文，选日文时自动升到 small。
 */
export function selectPaddleModels(
  quality: OcrQuality,
  language: OcrLanguage,
): PaddleModelSelection {
  const lang = languageSpec(language).paddle;
  const effective: OcrQuality = quality === 'fast' && lang === 'japan' ? 'balanced' : quality;
  const tier = effective === 'fast' ? 'tiny' : 'small';
  const det = PADDLE_MODELS[`PP-OCRv6_${tier}_det`];
  const rec = PADDLE_MODELS[`PP-OCRv6_${tier}_rec`];
  return {
    det,
    rec,
    lang,
    quality: effective,
    label: `PaddleOCR PP-OCRv6 ${tier}`,
    totalBytes: det.bytes + rec.bytes,
  };
}

export function formatMegabytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
