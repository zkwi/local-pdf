# ADR 002：pdf.js 在转换 Worker 内运行，不开嵌套 Worker

日期：2026-09-01 · 状态：已采纳

## 背景

pdf.js 默认会 `new Worker(workerSrc)`。我们的转换流程本身已经在一个 Web Worker 里，
按默认走就是嵌套 Worker。嵌套 Worker 虽然主流浏览器都支持，但在部分隐私模式、
部分嵌入式 WebView 下会失败，且多一层 postMessage 开销。

## 决定

在转换 Worker 启动时设置 `globalThis.pdfjsWorker = { WorkerMessageHandler }`
（静态 import `pdfjs-dist/build/pdf.worker.mjs`）。pdf.js 检测到它存在时，
会走 "fake worker" 路径，在当前上下文里直接跑 worker 逻辑。

配套改动：

- `CanvasFactory` → 基于 `OffscreenCanvas` 的实现（Worker 里没有 `document`）
- `FilterFactory` → 全部返回 `none` 的空实现（SVG 滤镜依赖 document）
- 必须显式传 `useWorkerFetch: true`——它的默认值计算会读 `document.baseURI`，
  在 Worker 里直接 `ReferenceError`
- 静态资源根 `assetBase` 由主线程算好传进来，Worker 里推导不出来

## 代价

- worker chunk 变大（约 2 MB）。但它是懒加载的，首屏只有 ~210 kB。
- PDF 解析和版面分析共用一个线程。它们本来就是顺序执行的，没有损失。
- pdf.js 会打一条 `Setting up fake worker` 的 warn，无害。
