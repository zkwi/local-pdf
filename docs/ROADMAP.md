# 后续方向

按「收益 / 代价」排序，不是承诺。

## 值得做

1. **页面诊断预览**
   把 PDF 渲染出来，叠加识别出的区域、栏边界、表格网格。三层 IR 里已经带了
   `sourceElementIds`，Semantic 块也带了 `origin`（页、bbox、置信度、是否 OCR），
   数据结构不用改，只差一个画 overlay 的组件。这也是所有版面算法调优的基础设施。

2. **用户手工修正**
   手动指定栏数、拖动调整区域顺序、框选表格区域、框选 OCR 区域。
   PDF 的任意版式没法靠规则全自动判准，**让用户改一两个区域，往往比无限堆启发式更有效**。

3. **区域级混合 OCR**
   现在是页级判断：原生文字覆盖了一部分页面时整页仍用原生文字，只给警告。
   下一步是找出没有原生文字的大块图像区域，只对这些区域 OCR，再和原生文字合并。

4. **完全无线的表格**
   只有横线的表（三线表、对账单）已经支持。一条线都没有的表，`ConvertOptions.detectBorderlessTables`
   仍是占位（不生效）。真要做，依据是：
   多行稳定的 X 对齐簇、列间空白、行间距规律、数字/文本的对齐形式。
   阈值必须设高——低置信度时宁可输出成多个对齐段落，也不要生成错误表格。

5. **Markdown 导入 → Word**
   用户编辑过 Markdown 之后导回来生成 Word。`remark-parse` → mdast → `SemanticDocument` → `DocxWriter`，
   写出这一侧已经有了，缺一个 importer。定位是"内容优先的干净 Word"，不承诺版面保真。

6. **文字颜色**
   pdf.js 的文本接口不带颜色。要拿到得在遍历操作符列表时把 `setFillRGBColor`
   和 `showText` 的顺序对齐，工程量不小。

7. **页码范围扩展到 Word / Markdown 输出**
   0.4.0 只给 PDF → 图片加了页码范围。文字流水线按页索引串行、页眉页脚跨页比对，
   跳页时要确认 `pageIndex` 不连续不会影响分栏和页眉页脚判断，再把同一个选项接过去。

## 想清楚再做

8. **高保真模式**
   浮动文本框 + 固定定位。视觉接近但编辑体验差，且 Word / LibreOffice / OnlyOffice
   对浮动对象的处理差异不小。建议先做完诊断预览，看真实需求再定。

9. **WebGPU 推理**
   ONNX Runtime Web 支持 WebGPU 后端，SDK 也支持 `backend: 'auto'`。
   但算子覆盖和浏览器支持不齐，wasm 回退必须保留；jsep 版 wasm 还要多带 26 MB。
   先在参考设备上量一下再决定。

10. **PP-StructureV3 的版面/表格/公式模型**
    Python 版能直接出 Markdown，但浏览器 SDK 目前只暴露检测 + 识别。
    等官方 SDK 跟上再说，不自己移植。

11. **PWA / 离线**
    模型已经进 Cache Storage 了，差的是 pdf.js 资源、ORT wasm 和应用本身的 Service Worker 缓存。

## 明确不做

- 把 BentoPDF / PDFCraft / pdf2docx 的代码搬进来（和自研版面引擎的路线冲突；见 ADR 001）
- 所有页面默认 OCR（慢十倍，收益为负）
- 为了"看起来完整"而输出低置信度的表格
- 把 Markdown 当作 PDF→Word 的中间格式（它表达不了坐标、字体、合并单元格；两种输出都从 SemanticDocument 生成）
- 保留第二个 OCR 引擎作对照（见 ADR 006）
