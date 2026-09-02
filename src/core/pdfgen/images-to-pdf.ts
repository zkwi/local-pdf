import { ContentStream } from './content.ts';
import { PdfDocument } from './document.ts';
import { PX_TO_PT, placeImage } from './page-layout.ts';
import type { ImagePageOptions } from './page-layout.ts';
import { encodeImageFile } from './raster.ts';
import type { ImageQuality } from './raster.ts';

export type Rotation = 0 | 90 | 180 | 270;

export interface ImageItem {
  readonly file: File;
  readonly rotation: Rotation;
}

export interface ImagesToPdfOptions extends ImagePageOptions {
  readonly quality: ImageQuality;
  readonly title?: string;
}

export interface ImagesToPdfHooks {
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface ImagesToPdfResult {
  readonly bytes: Uint8Array;
  readonly pages: number;
}

/** 一张图一页，按列表顺序。旋转不动像素，画的时候转矩阵。 */
export async function imagesToPdf(
  items: readonly ImageItem[],
  options: ImagesToPdfOptions,
  hooks: ImagesToPdfHooks = {},
): Promise<ImagesToPdfResult> {
  if (items.length === 0) throw new Error('no images');
  const doc = new PdfDocument({ cjk: 'zh-CN', title: options.title });
  for (let i = 0; i < items.length; i++) {
    hooks.signal?.throwIfAborted();
    hooks.onProgress?.(i, items.length);
    const item = items[i];
    const decoded = await encodeImageFile(item.file, options.quality, hooks.signal);
    const rotation = ((decoded.rotation + item.rotation) % 360) as Rotation;
    const sideways = rotation === 90 || rotation === 270;
    // 显示尺寸：转 90/270 后宽高对调
    const shownWidth = (sideways ? decoded.source.height : decoded.source.width) * PX_TO_PT;
    const shownHeight = (sideways ? decoded.source.width : decoded.source.height) * PX_TO_PT;
    const placed = placeImage(shownWidth, shownHeight, options);
    const name = doc.addImage(`img-${i}`, decoded.source);
    const content = new ContentStream();
    content.image(name, placed.x, placed.y, placed.width, placed.height, rotation);
    doc.addPage({
      width: placed.pageWidth,
      height: placed.pageHeight,
      content: content.toString(),
      fonts: content.fonts,
      images: content.images,
    });
  }
  hooks.onProgress?.(items.length, items.length);
  return { bytes: doc.finish(), pages: doc.pageCount };
}
