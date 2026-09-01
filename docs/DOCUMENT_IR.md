# 中间模型（Document IR）

三层，类型定义都在 `src/core/contracts/`。跨层只能通过这些类型通信。

## 坐标系

所有层统一使用：

- 原点在**左上角**，y 轴**向下**
- 单位是 **PDF point**（1/72 inch）
- 页面 `/Rotate` 已在抽取阶段消化，后续模块不需要再处理页面旋转

单位换算集中在 `src/core/geometry/units.ts`，业务代码里不允许出现 `20` / `12700` / `9525` 这类魔法数。

| 函数 | 用途 |
| --- | --- |
| `ptToTwip` | 段落缩进、间距、表格宽度、页面尺寸 |
| `ptToHalfPoint` | 字号 |
| `ptToEmu` | 图形 |
| `ptToPx96` | `docx` 的 `ImageRun.transformation` |

## 第 1 层：PrimitiveDocument

**忠实记录 PDF 里有什么，不做任何推断。** 每个字段都能回溯到具体的绘制指令。

```ts
interface PrimitiveTextSpan {
  id: string;              // 全局唯一，是后续所有溯源的锚点
  pageIndex: number;
  text: string;
  bbox: BBox;
  baseline: number;        // 行聚类靠它，不是 bbox.y
  fontSize: number;
  fontKey: string;         // pdf.js 内部字体键
  fontName: string;        // 真实 PostScript 名
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  rotation: number;        // 顺时针角度，[0, 360)
  vertical: boolean;
  source: 'native-pdf' | 'ocr';
  confidence: number;      // 原生文字恒为 1，OCR 用识别置信度
  hasEOL: boolean;
}
```

另有 `PrimitiveImage`（占位框）、`PrimitiveSegment`（轴对齐直线段）、
`PrimitiveLink`、`TextHealth`（文本健康度，决定是否 OCR）。

`PrimitiveSegment` 用「位置 + 起止」而不是两个端点，因为下游只关心轴对齐的框线：

```ts
interface PrimitiveSegment {
  orientation: 'horizontal' | 'vertical';
  position: number;   // horizontal 时是 y，vertical 时是 x
  start: number;      // 沿线方向的起止
  end: number;
  thickness: number;
}
```

## 第 2 层：LayoutDocument

**版面分析结果。** 每个块都带 `LayoutMetadata`：

```ts
interface LayoutMetadata {
  pageIndex: number;
  bbox: BBox;
  readingOrder: number;
  confidence: number;              // 0~1
  sourceElementIds: readonly string[];   // 关键：能回溯到第 1 层
}
```

`sourceElementIds` 一路传到第 3 层。有了它，未来做「点 Word 段落高亮 PDF 原文」
的预览交互不需要改任何数据结构。

块类型：

```ts
type LayoutBlock =
  | ParagraphBlock    // + firstLineIndent, alignment
  | HeadingBlock      // + level 1..4
  | ListItemBlock     // + ordered, marker, markerStyle, level
  | TableBlock        // + rows, cols, columnWidths, cells, bordered
  | ImageBlock        // + PNG 字节, 尺寸
  | HeaderFooterBlock;
```

`TableCell` 里存的是 `TextLine[]` 而不是拼好的字符串——单元格里也可能有多段。

## 第 3 层：SemanticDocument

**只有 Word 概念，没有任何坐标。** `docx.js` 只能看到这一层。

```ts
interface SemanticDocument {
  metadata: DocumentMetadata;
  sections: SemanticSection[];   // 按纸张尺寸分节
  warnings: ConversionWarning[];
  defaultFontSizePt: number;
}

type SemanticBlock =
  | SemanticParagraph   // runs, alignment, 缩进/间距/行距（pt）
  | SemanticHeading
  | SemanticListItem    // literalMarker 有值时不用 Word 自动编号
  | SemanticTable
  | SemanticImage
  | SemanticPageBreak;
```

几个刻意的设计：

- **`SemanticRun.field`**：页脚里的纯数字会被换成 `field: 'page-number'`，
  writer 写成 Word 的 PAGE 域。写死数字的话每页都会印成第一页的页码。
- **`SemanticListItem.literalMarker`**：中文数字（`一、`）、圆圈数字（`①`）、
  带括号编号（`（2）`）这些 Word 自动编号还原不了，交给 Word 会被改写成 `1. 2. 3.`。
  这类标记保留原文，只用缩进模拟列表外观。只有 `1.` / `a)` 这种才用 Word 自动编号。
- **节的页边距取全节最小值**，不是第一页的值。用第一页的话，后面页边距更小的页面内容会被裁掉。

## 数据流向

```text
PrimitiveDocument ──analyzeDocument()──▶ LayoutDocument ──buildSemanticDocument()──▶ SemanticDocument
     ▲                                                                                      │
     │                                                                                 writeDocx()
  PdfSession.extractPage()                                                                  ▼
                                                                                       DOCX Blob
```

三个函数都是纯函数（`writeDocx` 除外，它异步打包 zip），没有隐藏状态，方便单测和 snapshot。
