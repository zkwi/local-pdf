# ADR 006：OCR 只用 PaddleOCR.js，模型自己下载、自己缓存

日期：2026-09-02 · 状态：已采纳 · 取代 ADR 005 中关于 Tesseract 的部分

## 背景

第一版 OCR 用的是 Tesseract.js。它的中文识别对扫描件、复杂排版和表格一般，
而 PaddleOCR 在 2026-06 发布了官方浏览器 SDK `@paddleocr/paddleocr-js`（Apache-2.0），
PP-OCRv6 一个模型覆盖中/英/日等 50 种语言，中文准确率明显更好。

两个引擎并存意味着两套模型托管、两套测试面和界面上一个多数人不会动的选项，
所以直接换掉，不保留 Tesseract。

## 事实核查（2026-09-01 实测）

| 项目 | 结果 |
| --- | --- |
| npm 包 | `@paddleocr/paddleocr-js@0.4.2`，官方 PaddlePaddle 仓库，Apache-2.0 |
| 传递依赖 | onnxruntime-web（MIT）、@techstark/opencv-js（Apache-2.0）、clipper-lib（BSL）、js-yaml（MIT） |
| 模型体积 | tiny 6.3 MB（det 1.7 + rec 4.3），small 30.7 MB（det 9.4 + rec 20.3） |
| 运行时体积 | SDK 嵌套 Worker 3.4 MB gzip（含 OpenCV.js），ORT jsep wasm 26.5 MB 原始 / 约 7 MB gzip |
| 首次总下载 | 极速档约 17 MB，高精度档约 41 MB（wasm 按 gzip 计） |
| 直连模式能否在 Worker 里跑 | **不能**：`bitmapToSourceMat()` 无条件调用 `document.createElement("canvas")` |
| Worker 模式 | 用 OffscreenCanvas，嵌套 Worker 里正常 |
| 模型源 CORS | bcebos 对 GET 返回 `Access-Control-Allow-Origin`，浏览器可直接拉 |

## 决定

### 1. 拓扑：转换 Worker 里用 SDK 的 `worker: true`

```text
主线程
  └─ 转换 Worker（pdf.js + 版面引擎 + docx.js）
       └─ PaddleOCR Worker（SDK 自己起的，跑 OpenCV.js + ONNX Runtime）
```

方案评估时曾考虑把 OCR 调度搬回主线程避免嵌套 Worker。不必要：这个应用之前用 Tesseract 时
就是在转换 Worker 里起嵌套 Worker 的，已经验证可用。直连模式反而跑不了（见上表）。

### 2. 模型不交给 SDK 下载，自己下、自己缓存

SDK 的 `ModelAsset` 只接受 URL，也没有下载进度回调。我们：

1. 在转换 Worker 里流式 `fetch` 模型，按字节报进度；
2. 校验 SHA-256（清单在 `src/core/ocr/paddle-models.ts`）；
3. 放进 Cache Storage（`local-pdf-ocr-models-v1`），下次直接命中，断网也能用；
4. 以 `blob:` URL 交给 SDK。实测嵌套 Worker 能 fetch 到父 Worker 创建的 blob URL。

取模型的顺序：Cache Storage → 应用自己的 `ocr-models/`（`npm run ocr-models` 下载到 public）→ 官方 bcebos 源。
本地目录探测用 HEAD 请求，并检查 content-type 不是 `text/html`（dev/preview 对未知路径会回落到 index.html）。

### 3. ORT wasm 只认 postinstall 复制的那份，而且是 jsep 版

SDK 打进来的 ORT 胶水代码和 wasm 必须是同一版本；SDK 默认回落到 jsdelivr 上一个**写死的版本号**，
和 npm 实际解析到的版本不一定一致。所以 `scripts/copy-runtime-assets.mjs` 从 `node_modules/onnxruntime-web`
复制到 `public/ort/`，`wasmPaths` 固定指向它。

复制的是 `ort-wasm-simd-threaded.jsep.{mjs,wasm}`：SDK 引的是 ORT 的默认构建（`ort.mjs`，含 WebGPU），
这个构建里 wasm 后端也从 jsep 版文件加载，非 jsep 那对它根本不会请求。实测复制错文件的报错是
`no available backend found ... Failed to fetch dynamically imported module .../ort-wasm-simd-threaded.jsep.mjs`。
代价是 wasm 从 13 MB 变成 26 MB（gzip 后约 7 MB），换来以后开 WebGPU 不用再多下一份。

### 4. 线程数看 `crossOriginIsolated`

多线程 wasm 需要 COOP/COEP。默认不加这两个头（会连带要求所有跨源资源带 CORP），
`numThreads = crossOriginIsolated ? min(4, cores-1) : 1`。想要多线程的部署自己加头即可，代码不用改。

### 5. OCR 渲染倍率至少 3×

72 pt × 3 ≈ 216 DPI。2× 时小字号的识别率掉得明显。整页渲染有 2000 万像素上限，超大页面会按面积回退倍率。

### 6. 起不来就报 `ocr-failed`，不回退

没有第二个引擎可退。失败原因写进警告（模型下载失败、浏览器缺 OffscreenCanvas 等），该页按空白处理。

## Vite 开发态的两个坑

- SDK 用 `new URL('./assets/worker-entry-*.js', import.meta.url)` 起嵌套 Worker，
  依赖预构建会把 `import.meta.url` 指到 `.vite/deps/` 下 → 必须 `optimizeDeps.exclude`。
- 排除之后它自己的 CommonJS 依赖（clipper-lib、opencv-js）会被原样下发，`import x from` 拿不到默认导出
  → 用 `optimizeDeps.include: ['@paddleocr/paddleocr-js > clipper-lib', ...]` 单独预构建。

生产构建走 Rollup，没有这两个问题。

## 代价

- 首次 OCR 下载从 Tesseract 的约 8.5 MB 涨到约 17 MB（极速档，wasm 按 gzip 计）。模型进 Cache Storage，wasm 走 HTTP 缓存。
- 开发态 `optimizeDeps` 配置多了几行，且依赖列表变了要重启 dev server。
