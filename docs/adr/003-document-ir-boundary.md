# ADR 003：强制三层中间模型

日期：2026-09-01 · 状态：已采纳

## 背景

最容易走的路是：拿到 pdf.js 的 TextItem，立刻 `new Paragraph()`。
这条路的问题在几周后才会显现——段落合并、分栏、表格、OCR、页眉页脚的逻辑
会全部糊在同一个函数里，改一处崩一片，而且没有任何一段能单独测试。

## 决定

强制三层，跨层只能通过 `src/core/contracts/` 里的类型通信：

1. `PrimitiveDocument` —— 忠实记录 PDF 里有什么，不推断
2. `LayoutDocument` —— 版面分析结果，带 bbox / 阅读序 / 置信度 / 溯源 id
3. `SemanticDocument` —— 只有 Word 概念，没有坐标

`docx.js` 只能接触第 3 层，版面算法只在第 1→2 层，`core/layout` 完全不依赖 pdf.js。

每个版面块都保留 `sourceElementIds`，一路传到第 3 层。

## 收益

- 版面算法是纯函数，单测直接手搓 span，不需要造 PDF
- 换 DOCX 生成库不用动版面算法；换解析器不用动 Word 输出
- `sourceElementIds` 让未来的「点 Word 段落高亮 PDF 原文」不需要改数据结构
- 每一阶段的中间结果都能 JSON 序列化，方便 snapshot 和诊断

## 代价

多了一层数据转换和一堆类型定义。对这个规模的项目，这个代价是划算的。
