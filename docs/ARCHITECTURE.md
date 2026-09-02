# 架构

## 一句话

```text
PDF ──pdf.js──▶ 原始元素 ──自研版面引擎──▶ 版面模型 ──语义构建──▶ Word 语义模型 ──docx.js──▶ DOCX Blob
                                    ▲
                        扫描页 ──渲染──▶ OCR ──┘
```

整条链路跑在一个 Web Worker 里，主线程只负责界面。

## 为什么是这几层

PDF 描述的是「在某个坐标画什么」，Word 描述的是「段落、表格、样式的流式排版」。
两者之间没有直接映射，中间必须有一层显式的版面理解。

关键约束：**不允许出现 `PDF TextItem → new Paragraph()` 这种直连**。
一旦直连，段落合并、分栏、表格、OCR 这些逻辑就会全部糊在一起，改一处崩一片，也没法单测。

所以强制三层中间模型（详见 [DOCUMENT_IR.md](DOCUMENT_IR.md)）：

| 层 | 类型 | 职责 | 允许知道 |
| --- | --- | --- | --- |
| 1 | `PrimitiveDocument` | 忠实记录 PDF 里有什么 | PDF 概念 |
| 2 | `LayoutDocument` | 推断版面结构 | PDF 概念 + 版面概念 |
| 3 | `SemanticDocument` | 描述 Word 里该长什么样 | 只有 Word 概念 |

`docx.js` 只能接触第 3 层；版面算法只在第 1→2 层。换 DOCX 生成库不用动版面算法，
换解析器（比如换成 MuPDF.js）不用动 Word 输出。

## 模块边界

```text
core/contracts   ← 谁都可以依赖，它谁都不依赖
core/util        ← 同上；目前只有文本清洗（XML 非法字符）
core/geometry    ← 只依赖 contracts
core/pdf         ← contracts + geometry + pdfjs-dist
core/layout      ← contracts + geometry           （不碰 pdf.js，纯函数，好测）
core/semantic    ← contracts + geometry + layout/text
core/docx        ← contracts + geometry + docx
core/markdown    ← contracts (+ 动态 import unified/remark、fflate)
core/ocr         ← contracts + geometry (+ 动态 import @paddleocr/paddleocr-js)
core/converter   ← 以上全部，负责编排
worker/          ← converter
i18n/            ← contracts（把 code / key + params 变成当前语言的文案）
ui/ hooks/       ← contracts + worker 协议 + i18n（不直接调 converter）
```

`core/layout` 不依赖 pdf.js 是刻意的：版面算法全是 `(输入数据) → (输出数据)` 的纯函数，
单测里直接手搓 span 就能覆盖，不需要造 PDF。

## pdf.js 的两个非常规用法

### 1. 在当前 Worker 里跑，而不是再开一个嵌套 Worker

`src/core/pdf/pdfjs-runtime.ts` 里设置 `globalThis.pdfjsWorker`，pdf.js 检测到之后
会直接在当前上下文运行 worker 逻辑。我们本来就已经在 Worker 里，pdf.js 没必要再套一层。
代价是这个 chunk 会比较大，但它是懒加载的，首屏不受影响。

OCR 是例外：PaddleOCR.js 的直连模式依赖 `document`，只能用它的 `worker: true` 模式，
于是转换 Worker 里会再起一个 OCR Worker。拓扑、模型下载与缓存见 ADR 006。

### 2. Worker 里没有 document，要替换两个工厂

- `CanvasFactory` → `OffscreenCanvasFactory`（pdf.js 默认的 `DOMCanvasFactory` 要 `document.createElement`）
- `FilterFactory` → `NoopFilterFactory`（SVG 滤镜依赖 document，一律返回 `none`，只影响少数图像色彩变换）

还有一个坑：`getDocument` 里 `useWorkerFetch` 的默认值计算会读 `document.baseURI`，
在 Worker 里直接抛 `ReferenceError`。所以必须显式传 `useWorkerFetch: true`。

同理，Worker 里没有 `document.baseURI`，静态资源根必须由主线程算好通过消息传进来
（`assetBase`），不能在 Worker 里推导。

第三方包也会踩这个坑：remark 依赖的 `decode-named-character-reference` 的 browser 入口在模块顶层
`document.createElement('i')`，打进 Worker 就是 `document is not defined`。`vite.config.ts` 里把它
别名到 node 入口（纯 JS 查表）。以后往 Worker 里加依赖，先在生产构建里跑一遍，不要只看 dev。

## 抽取阶段做了什么

`core/pdf/extractor.ts` 一次遍历拿三样东西：

1. **文字**：`getTextContent()` → 用 `Util.transform(viewport.transform, item.transform)`
   把文本矩阵映射到「左上角原点、y 向下、单位 pt」的归一化坐标系。页面 `/Rotate` 在
   `getViewport` 这一步就消化掉了，后续所有模块都不用再管页面旋转。
2. **矢量线段**：`getOperatorList()` → 维护 CTM，解 `constructPath` 的扁平路径编码，
   抽出轴对齐直线段。这是有框线表格识别的唯一依据。
   - 描边路径：所有折线边都算候选框线。
   - 填充路径：只有本身就是细长条时才算，否则单元格底色的四条边会被当成表格线。
3. **图像占位框**：PDF 图像画在单位方框里，`paintImageXObject` 时的 CTM 就是它的实际位置。

字体的粗斜体从 `page.commonObjs.get(fontKey)` 拿（`getOperatorList` 之后才可用），
拿不到时退化成按字体名正则匹配 `bold|black|italic|oblique`。

## 版面引擎

按顺序：

1. **`lines.ts`** span → 文本行。按基线聚类（比 bbox 聚类稳，上下标不会把行拆开），
   再按「同基线上的超大间距」拆行——**双栏排版左右两栏的基线经常完全对齐，不拆就会
   连成一条跨栏的行，后面的分栏检测再也找不到那条竖向空隙**。
2. **`tables.ts`** 框线合并 → 相交关系做连通分量 → 每个含 ≥2 横线和 ≥2 竖线的分量是一张表。
   缺失的内部框线即为合并单元格。表内文字从 span 直接按中心点归格，不走文本行。
3. **`regions.ts`** XY-Cut。先找竖向空隙（分栏），找不到再找横向空隙（段落带），递归。
   竖向优先是有意的：双栏页面上方有跨栏标题时，带着标题不存在贯通的竖向空隙，
   于是自动退化成「先横切出标题带，再在下半部分竖切出两栏」，正是想要的顺序。
4. **`blocks.ts`** 区域内切段落，并分类成段落 / 标题 / 列表项。
5. **`header-footer.ts`** 跨页重复检测。数字归一成 `#`，所以「第 3 页」和「第 12 页」能聚到一起。
6. **`analyze.ts`** 编排以上，把表格和图片按位置插回正文流，算页边距和置信度。

## 文案

核心层不产生自然语言：警告是 `{ code, params }`，进度是 `{ key, params }`，Worker 错误是 `{ code, detail }`。
界面用 `src/i18n/` 里的文案表按当前语言渲染，四种语言由类型强制齐全。见 ADR 007。

## 置信度与警告

每页输出 `confidence` 和 `warnings`。这不是装饰——PDF 的版式是任意的，
规则一定有判不准的时候。**与其让算法硬猜，不如把不确定性显式交给用户**：
转换报告里逐页列出把握度，低的页面提示人工核对。

## 内存

- `ArrayBuffer` 用 transferable 传进 Worker，不做 Base64。
- 逐页处理，每页处理完立即 `page.cleanup()`。
- 整页渲染只在「需要抽图」或「需要 OCR」时才做，用完立刻把 canvas 尺寸清零。
- 单张图最多 400 万像素，单份文档图片总量上限 80 MB，超了停止抽图并给警告。
- Worker 里任务串行执行，避免多份大文档同时占内存。

## 取消

`AbortController` 在主线程创建 → Worker 里按 jobId 存 controller → 转换流水线在每页
边界检查 `signal.aborted`，抛 `CancelledError`。取消后不会再发 `done` 事件。
