/** 图片转 PDF 的页面几何：全部用 pt，1 pt = 1/72 英寸 */

export type ImagePageSize = 'fit' | 'a4' | 'letter';
export type PageOrientation = 'auto' | 'portrait' | 'landscape';
export type PageMargin = 'none' | 'small' | 'normal';

export interface ImagePageOptions {
  readonly pageSize: ImagePageSize;
  readonly orientation: PageOrientation;
  readonly margin: PageMargin;
}

export interface PlacedImage {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const PAPER: Record<Exclude<ImagePageSize, 'fit'>, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const MARGIN_PT: Record<PageMargin, number> = { none: 0, small: 28.35, normal: 56.7 };

/** 网页像素按 96 DPI 折成 pt：截图在 PDF 里和屏幕上一样大 */
export const PX_TO_PT = 72 / 96;

/**
 * 把一张 imageWidth × imageHeight（pt）的图放进页面：
 * fit 模式页面贴着图片（加页边距）；固定纸张时等比缩放到内容区里居中。
 */
export function placeImage(
  imageWidth: number,
  imageHeight: number,
  options: ImagePageOptions,
): PlacedImage {
  const margin = MARGIN_PT[options.margin];
  if (options.pageSize === 'fit') {
    return {
      pageWidth: imageWidth + margin * 2,
      pageHeight: imageHeight + margin * 2,
      x: margin,
      y: margin,
      width: imageWidth,
      height: imageHeight,
    };
  }
  const [short, long] = PAPER[options.pageSize];
  const landscape =
    options.orientation === 'landscape' ||
    (options.orientation === 'auto' && imageWidth > imageHeight);
  const pageWidth = landscape ? long : short;
  const pageHeight = landscape ? short : long;
  const boxWidth = pageWidth - margin * 2;
  const boxHeight = pageHeight - margin * 2;
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight, 1e9);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    pageWidth,
    pageHeight,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}
