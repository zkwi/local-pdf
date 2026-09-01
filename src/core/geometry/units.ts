/**
 * Word 单位换算集中在这里，业务代码里不要出现 20 / 12700 / 9525 这类魔法数。
 * - twip: 1/20 pt，用于段落缩进、间距、表格宽度
 * - half-point: 字号单位
 * - EMU: 1/12700 pt，用于图形
 * - px(96dpi): docx 的 ImageRun.transformation 用它
 */
export const ptToTwip = (pt: number): number => Math.round(pt * 20);
export const ptToHalfPoint = (pt: number): number => Math.max(2, Math.round(pt * 2));
export const ptToEmu = (pt: number): number => Math.round(pt * 12700);
export const ptToPx96 = (pt: number): number => pt * (96 / 72);
export const px96ToPt = (px: number): number => px * (72 / 96);
