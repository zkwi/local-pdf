# ADR 001：核心链路只用宽松许可依赖

日期：2026-09-01 · 状态：已采纳

## 背景

浏览器端 PDF→Word 已有几个完整实现，但都不能直接用作产品内核：

| 项目 | 许可 | 问题 |
| --- | --- | --- |
| BentoPDF | AGPL-3.0 | 内核是 Pyodide + PyMuPDF + pdf2docx + OpenCV，资源极重 |
| PDFCraft | AGPL-3.0 | 同属 Python/WASM 路线 |
| pdf2docx | MIT，但依赖 PyMuPDF（AGPL/商业双许可） | 单看它是 MIT，整条依赖链不是 |
| MuPDF.js | AGPL/商业 | 结构化抽取能力强，但许可不合适 |

## 决定

- 运行时依赖只允许宽松许可：pdf.js（Apache-2.0）、docx（MIT）、
  PaddleOCR.js（Apache-2.0，见 ADR 006）、React（MIT）。
- BentoPDF / PDFCraft / pdf2docx 只作为**参考实现和测试基线**，不复制代码。
- 需要 MuPDF.js 这类能力时，放独立包、独立构建、默认不分发。
- 测试夹具生成脚本用了 PyMuPDF，但它不在 `package.json` 里，不进产品链路。

## 理由

pdf2docx 最值得借鉴的是它的**转换思想**（原始元素 → 区块/行/Span → 段落 → 图片 →
表格 → 输出），而不是代码。思想不受许可约束，照着在 TypeScript 里重新设计即可。

Pyodide 方案还有一个独立于许可的问题：Python + NumPy + OpenCV + PyMuPDF 加起来几十 MB，
首屏体验和低内存设备上的表现很难控制，而且 JS 团队没法深入改转换算法。

## 代价

版面算法要自己写。这也是这个项目真正的资产——pdf.js 和 docx.js 是可替换的，
版面引擎、中间模型、测试语料、失败诊断不是。
