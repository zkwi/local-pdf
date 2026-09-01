import type { PrimitiveTextSpan } from '../contracts/primitives.ts';
import { makeBBox } from '../geometry/bbox.ts';
import type { OcrEngine, OcrProgress } from './engine.ts';

export interface TesseractOptions {
  readonly languages: string;
  /** 自托管资源根目录（以 / 结尾）；留空则用 tesseract.js 默认 CDN */
  readonly assetBase: string;
  readonly onProgress?: (progress: OcrProgress) => void;
}

interface TesseractBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface TesseractWord {
  text: string;
  confidence: number;
  bbox: TesseractBbox;
}

/**
 * Tesseract.js 适配器。这里只做"图 → 带坐标的文字"，
 * 版面分析仍然复用主流程，OCR 换成别的引擎时不影响后续所有环节。
 */
export async function createTesseractEngine(options: TesseractOptions): Promise<OcrEngine> {
  const { createWorker } = await import('tesseract.js');
  const base = options.assetBase;
  const workerOptions: Record<string, unknown> = {
    logger: (m: { status: string; progress: number }) => {
      options.onProgress?.({ status: m.status, progress: m.progress });
    },
  };
  if (base !== '') {
    workerOptions.langPath = `${base}tessdata`;
    workerOptions.corePath = `${base}tesseract-core`;
    workerOptions.workerPath = `${base}worker.min.js`;
  }

  const worker = await createWorker(options.languages.split('+'), undefined, workerOptions);

  return {
    async recognize(canvas, scale, pageIndex) {
      const result = await worker.recognize(canvas, {}, { blocks: true });
      const words: TesseractWord[] = [];
      for (const block of result.data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) words.push(word as unknown as TesseractWord);
          }
        }
      }
      return words
        .filter((w) => w.text.trim() !== '')
        .map((word, i) => toSpan(word, scale, pageIndex, i));
    },
    async terminate() {
      await worker.terminate();
    },
  };
}

function toSpan(
  word: TesseractWord,
  scale: number,
  pageIndex: number,
  seq: number,
): PrimitiveTextSpan {
  const x0 = word.bbox.x0 / scale;
  const y0 = word.bbox.y0 / scale;
  const x1 = word.bbox.x1 / scale;
  const y1 = word.bbox.y1 / scale;
  const height = Math.max(1, y1 - y0);

  return {
    id: `p${pageIndex}-ocr${seq}`,
    pageIndex,
    text: word.text,
    bbox: makeBBox(x0, y0, x1, y1),
    // OCR 给的是整词外框，基线按经验落在框底往上约 0.18 个字高
    baseline: y1 - height * 0.18,
    fontSize: height * 0.92,
    fontKey: 'ocr',
    fontName: 'OCR',
    fontFamily: 'sans-serif',
    bold: false,
    italic: false,
    rotation: 0,
    vertical: false,
    source: 'ocr',
    confidence: Math.max(0, Math.min(1, word.confidence / 100)),
    hasEOL: false,
  };
}
