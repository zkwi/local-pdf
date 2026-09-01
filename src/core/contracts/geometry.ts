/** 归一化坐标系：左上角原点、y 轴向下、单位为 PDF point（1/72 inch），已应用页面旋转。 */
export interface BBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}
