# 第三方依赖许可

统计自 `package-lock.json`，核对日期 2026-09-02。

项目本身以开源协议发布，对依赖许可没有硬性排斥；这里只是把实际情况记录下来。
当前运行时依赖全部是宽松许可（MIT / Apache-2.0 / BSD / ISC / BSL）。

核对命令：

```bash
node -e "const l=require('./package-lock.json');const m={};for(const[p,i]of Object.entries(l.packages||{})){if(!p)continue;const x=Array.isArray(i.license)?i.license.join('/'):(i.license||'UNKNOWN');m[x]=(m[x]||0)+1}console.log(m)"
```

## 直接依赖

### 运行时

| 包 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| `pdfjs-dist` | 6.3.289 | Apache-2.0 | PDF 解析、页面渲染 |
| `docx` | 9.7.1 | MIT | 生成 DOCX |
| `@paddleocr/paddleocr-js` | 0.4.2 | Apache-2.0 | 扫描件 OCR（按需动态加载） |
| `unified` / `remark-stringify` / `remark-gfm` | 11 / 11 / 4 | MIT | SemanticDocument → mdast → Markdown |
| `fflate` | 0.8.3 | MIT | Markdown 包（.md + 图片 + manifest）打 zip |
| `react` / `react-dom` | 19.2.x | MIT | 界面 |

### PaddleOCR.js 带进来的

| 包 | 版本 | 许可 | 说明 |
| --- | --- | --- | --- |
| `onnxruntime-web` | 1.29.0 | MIT | 推理运行时；wasm 由 postinstall 复制到 `public/ort/` |
| `@techstark/opencv-js` | 4.10.0 | Apache-2.0 | 检测后处理，打在 SDK 的 Worker 里 |
| `clipper-lib` | 6.4.2 | BSL（Boost） | 多边形扩张 |
| `js-yaml` | 4.3.2 | MIT | 读模型自带的 inference.yml |

### 开发时

| 包 | 版本 | 许可 |
| --- | --- | --- |
| `vite` | 7.3.6 | MIT |
| `@vitejs/plugin-react` | 5.2.0 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `vitest` | 4.1.11 | MIT |
| `prettier` | 3.x | MIT |
| `@types/react`、`@types/react-dom`、`@types/mdast` | — | MIT |

## 传递依赖许可分布

共 281 个包：

| 许可 | 数量 |
| --- | --- |
| MIT | 242 |
| Apache-2.0 | 12 |
| BSD-3-Clause | 11 |
| ISC | 9 |
| BSD-2-Clause | 1 |
| BSL（Boost Software License） | 1（`clipper-lib`） |
| Python-2.0 | 1（`argparse`，仅开发时） |
| CC-BY-4.0 | 1（`caniuse-lite`，仅开发时） |
| MIT OR GPL-3.0-or-later | 1（`jszip`，双许可，取 MIT） |
| MIT AND Zlib | 1（`pako`） |
| BlueOak-1.0.0 | 1（`sax`） |

## OCR 模型

PP-OCRv6 tiny / small 模型由 PaddlePaddle 发布，随 PaddleOCR 项目采用 Apache-2.0。
默认从官方 bcebos 源按需下载（只下载、不上传），也可以 `npm run ocr-models` 下载到 `public/ocr-models/` 自托管。
下载脚本和运行时都会校验 SHA-256，清单见 `src/core/ocr/paddle-models.ts`。

## 非依赖，但用到的东西

| 项目 | 许可 | 关系 |
| --- | --- | --- |
| PyMuPDF | AGPL / 商业 | 只在本机跑 `tests/fixtures/make_fixtures.py` 生成测试 PDF，不在 `package.json` 里，不进产品 |
| BentoPDF、PDFCraft、pdf2docx | AGPL / MIT+AGPL 依赖链 | 仅作参考实现和竞品对照，未复制任何代码 |
