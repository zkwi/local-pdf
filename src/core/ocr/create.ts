import type { ConversionWarning } from '../contracts/layout.ts';
import type { ConvertOptions } from '../contracts/options.ts';
import type { OcrEngine, OcrEngineContext } from './engine.ts';
import { resolveOcrLanguage } from './languages.ts';

export interface CreatedOcrEngine {
  readonly engine: OcrEngine;
  readonly warnings: readonly ConversionWarning[];
}

/**
 * 按设置创建 OCR 引擎。适配器是动态 import 的，不开 OCR 时不进包。
 * 这一层留着是为了让 converter 不直接依赖具体引擎——以后加别的引擎只改这里。
 */
export async function createOcrEngine(
  options: ConvertOptions,
  context: OcrEngineContext,
): Promise<CreatedOcrEngine> {
  const { createPaddleEngine } = await import('./paddle.ts');
  const engine = await createPaddleEngine({
    ...context,
    quality: options.ocrQuality,
    language: resolveOcrLanguage(options),
  });
  const warnings: ConversionWarning[] = engine.unverifiedModels.map((name) => ({
    code: 'ocr-model-unverified',
    params: { model: name },
  }));
  return { engine, warnings };
}
