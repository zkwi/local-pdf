import { fmt } from './writer.ts';

/** 0~1 的 RGB */
export type Rgb = readonly [number, number, number];

export interface TextOp {
  /** 字体资源名（/F1） */
  readonly font: string;
  readonly size: number;
  /** 基线左端，PDF 坐标 */
  readonly x: number;
  readonly y: number;
  /** 已编码的十六进制串 <...> */
  readonly hex: string;
  readonly color: Rgb;
  /** 阅读器自带的中日韩字体没有粗体，描边一圈假装 */
  readonly fakeBold?: boolean;
  /** 同上没有斜体，用剪切矩阵斜过去 */
  readonly skew?: boolean;
  /** 字距，pt */
  readonly charSpacing?: number;
}

/** 内容流的字符串拼装；坐标一律是 pt、原点左下 */
export class ContentStream {
  #ops: string[] = [];
  /** 用到的资源名，页面字典只列这些 */
  readonly fonts = new Set<string>();
  readonly images = new Set<string>();

  fillRect(x: number, y: number, width: number, height: number, color: Rgb): void {
    this.#ops.push(`${rgb(color)} rg ${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re f`);
  }

  /** 单位正方形映射到目标矩形，rotation 是顺时针角度 */
  image(name: string, x: number, y: number, width: number, height: number, rotation = 0): void {
    let matrix: string;
    switch (rotation) {
      case 90:
        matrix = `0 ${fmt(-height)} ${fmt(width)} 0 ${fmt(x)} ${fmt(y + height)}`;
        break;
      case 180:
        matrix = `${fmt(-width)} 0 0 ${fmt(-height)} ${fmt(x + width)} ${fmt(y + height)}`;
        break;
      case 270:
        matrix = `0 ${fmt(height)} ${fmt(-width)} 0 ${fmt(x + width)} ${fmt(y)}`;
        break;
      default:
        matrix = `${fmt(width)} 0 0 ${fmt(height)} ${fmt(x)} ${fmt(y)}`;
    }
    this.images.add(name);
    this.#ops.push(`q ${matrix} cm ${name} Do Q`);
  }

  text(op: TextOp): void {
    this.fonts.add(op.font);
    const parts = [`BT ${op.font} ${fmt(op.size)} Tf ${rgb(op.color)} rg`];
    if (op.charSpacing !== undefined && op.charSpacing !== 0)
      parts.push(`${fmt(op.charSpacing)} Tc`);
    if (op.fakeBold === true) parts.push(`2 Tr ${fmt(op.size * 0.035)} w ${rgb(op.color)} RG`);
    const skew = op.skew === true ? fmt(0.22) : '0';
    parts.push(`1 0 ${skew} 1 ${fmt(op.x)} ${fmt(op.y)} Tm ${op.hex} Tj ET`);
    this.#ops.push(parts.join(' '));
  }

  toString(): string {
    return this.#ops.join('\n');
  }
}

function rgb(color: Rgb): string {
  return `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])}`;
}
