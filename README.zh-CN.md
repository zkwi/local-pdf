<p align="center">
  <a href="https://localpdfconverter.com"><img src="docs/social-card.png" alt="Local PDF" width="720"></a>
</p>

<h1 align="center">Local PDF</h1>

<p align="center">
  <b>在浏览器里把 PDF 转成 Word 和 Markdown。</b><br>
  不上传 · 无需注册 · 免费开源
</p>

<p align="center">
  <a href="https://localpdfconverter.com"><b>在线使用 →</b></a> ·
  <a href="README.md">English</a> ·
  <a href="CHANGELOG.md">更新日志</a>
</p>

<p align="center">
  <a href="https://github.com/zkwi/local-pdf/actions/workflows/ci.yml"><img src="https://github.com/zkwi/local-pdf/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-b4471f.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/%E5%85%A8%E7%A8%8B%E5%9C%A8%E6%B5%8F%E8%A7%88%E5%99%A8%E9%87%8C%E8%BF%90%E8%A1%8C-2f7d4f.svg" alt="全程在浏览器里运行">
</p>

## 为什么选 Local PDF

- **从结构上就不可能泄露。** 没有可以上传的服务器，解析、版面分析、OCR、文件生成全部在浏览器里跑，网络面板里可以自己确认。合同、对账单、论文不会离开你的电脑。
- **转出来的是真正的 Word，不是页面截图。** 段落、标题、列表、有线表格（含合并单元格）、图片、页眉页脚、页码域都会重建，可以接着编辑。
- **扫描件直接可用。** 没有文字层的页面用 PaddleOCR（PP-OCRv6）在浏览器里逐页识别，支持中、英、日等 50 多种语言；微信里常见的"长图"PDF 也能处理。
- **顺便给你 Markdown。** 同一份识别结果可以导出 Markdown，连图片和坐标、置信度清单一起打包。
- **反过来也行。** Word、Markdown、图片在同一个页面里转成 PDF：浏览器负责排版，Local PDF 写出文字可选中的小体积矢量 PDF。六个工具各有自己的地址：`/`（PDF 转 Word）、`/pdf-to-markdown`、`/pdf-to-images`、`/word-to-pdf`、`/markdown-to-pdf`、`/images-to-pdf`。
- **对质量说实话。** 每份文件附一份转换报告：逐页把握度、元素统计、提示，告诉你哪些页面该再看一眼。
- **免安装、可离线。** 纯静态站，四种界面语言，模型第一次用后就缓存在本地。

![界面](docs/screenshot.png)

## 能做什么

| 能力                       | 说明                                                   |
| -------------------------- | ------------------------------------------------------ |
| PDF → Word（.docx）        | 段落、标题、列表、有线表格（含只有横线的三线表、合并单元格）、图片 |
| PDF → Markdown             | 与 Word 来自同一份识别结果；有图片时打成 zip 并附 manifest |
| PDF → 图片（PNG / JPEG）   | 每页一张图，也可以只转 `1-3, 5, 8-` 这样的页码范围；96 / 150 / 300 DPI 可选；多张打成 zip |
| Word → PDF                 | .docx 在浏览器里排版后写成矢量 PDF：文字可选中，页眉页脚、自动编号、表格、图片都在；不嵌字体 |
| Markdown → PDF             | GFM 表格、任务列表、代码块、引用；.md 引用的图片一起拖进来即可，也可以直接粘贴文本 |
| 图片 → PDF                 | 拖动缩略图排序、旋转，可选纸张 / 页边距 / 图片质量；JPEG 原文件直接嵌入 |
| 多栏阅读顺序               | XY-Cut 版面切分，跨栏标题能正确处理                    |
| 中英文混排                 | 中文之间不补空格，西文按字距补；行尾断词合并           |
| 页眉页脚、页码             | 跨页检测；页码写成 Word 的 PAGE 域                     |
| 扫描件 OCR                 | PaddleOCR PP-OCRv6，逐页判断；原生文字永远优先；扫描件里的框线表格能还原；超大幅面扫描和手机截图按 A4 缩放 |
| 界面语言                   | 简体中文 · 繁體中文 · English · 日本語                 |
| 加密 PDF、批量队列         | 进度、取消、每份文件一份转换报告；「打包下载」把所有结果装进一个 zip |
| 随手拖、随手用             | 文件拖错了工具页会自动切到对的那个；设置会保留，工具徽标会提示尚未清掉的任务和图片 |

明确**不做**的：完全没有线的表格（误判代价高于收益）、嵌入字体、可编辑公式、竖排文字（压平并给警告）、文字颜色。
也不保证 Word 页数与 PDF 一致：每页强制分页，字体替换后溢出的内容会挤到下一页。

扫描长图的分片按图片保留，以免丢失图表；相应区域不再重复输出 OCR 文字，报告会提示图内文字不可编辑。如需文字，可关闭“保留图片”后重试。扫描文字层的转换结果仍需对照原文核对。

Word / Markdown 转 PDF 时，只读取本地图片；外部图片和不安全 HTML 会被阻止。EMF/WMF 等无法解码的图片显示占位并提示替换为 PNG/JPEG；补充平面的罕见字和 emoji 用 `□` 占位并计数提示，当前不提供这些字符的字体嵌入。

## 快速开始

```bash
npm install
npm run dev
```

打开 <http://localhost:5173>，把 PDF 拖进去。

```bash
npm run build       # 类型检查 + 打包到 dist/
npm run preview     # 本地预览 dist/
npm test            # 单测（版面引擎、OCR 坐标换算、Markdown、文案表）
npm run check       # 与 CI 相同的完整质量门禁
npm run ocr-models  # 可选：把 OCR 模型下载到 public/ocr-models/ 自托管
```

`dist/` 是纯静态目录，放到任何静态托管（Cloudflare Pages、GitHub Pages、对象存储、nginx）即可；
`base` 是相对路径，放子目录也行。**必须通过 http(s) 访问**，`file://` 下 OCR 起不来。

## OCR

引擎是 [PaddleOCR.js](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js)（官方浏览器 SDK，Apache-2.0），
模型 PP-OCRv6，一个模型覆盖中、英、日等 50 种语言。

| 档位         | 模型           | 首次下载                      | 适用             |
| ------------ | -------------- | ----------------------------- | ---------------- |
| 标准（默认） | PP-OCRv6 tiny  | 模型 6 MB + 运行时约 11 MB    | 普通扫描文档     |
| 高           | PP-OCRv6 small | 模型 31 MB + 运行时约 11 MB   | 小字号、模糊页面 |

- 只对需要的页面做 OCR：没有文字层、文字极少但大面积是图、整页是图而文字层只有水印或页眉页脚页码、或文字层乱码。
- 模型第一次用时下载，校验 SHA-256 后放进 Cache Storage，之后断网也能用。界面上能看到缓存了多少，可一键清除。
- ONNX Runtime 的 wasm（26.5 MiB）按 SDK 对应的精确版本从 jsDelivr 加载：它超过了 Cloudflare Pages 这类托管 25 MiB 的单文件上限。
- 想彻底不出外网：构建前跑 `npm run ocr-models`（或 `small` / `all`）和 `npm run ocr-runtime`，应用会优先用
  `public/ocr-models/` 和 `public/ort/`（后者需要托管方没有 25 MiB 限制）。
- 多线程推理需要跨源隔离，默认关闭。加上 `Cross-Origin-Opener-Policy: same-origin` 和
  `Cross-Origin-Embedder-Policy: require-corp` 即可开启（`public/_headers` 里有注释掉的现成写法）。开了 COEP 之后模型必须自托管。

## 部署

纯静态站。Cloudflare（Workers & Pages → Create → Workers → Import a repository）：连接 GitHub 仓库，
构建命令 `npm run build`，部署命令 `npx wrangler deploy`。`wrangler.jsonc` 声明了一个只有静态资源的 Worker，
产物目录 `dist/`，并绑定自定义域名；Node 22 来自 `.node-version`。`public/_headers` 里有缓存头，
多线程 OCR 需要的 COOP/COEP 以注释形式放在里面。其他静态托管把 `dist/` 当输出目录即可。

站点地址在几处 SEO 相关文件里写死了：`index.html` 的 canonical / hreflang / Open Graph、`public/robots.txt`、
`public/sitemap.xml`、`src/ui/SeoContent.tsx` 里的 `SITE_URL`。换域名部署时记得一起改。

## 隐私

- 没有任何上传代码，可以在网络面板自行确认：对外请求只有可选的 OCR 模型和运行时下载。
- pdf.js 的 CMap、标准字体、WASM 自托管（`npm install` 时复制进 `public/`）。
- 文件名、内容、页数都不会发到任何地方，没有统计埋点。

## 浏览器支持

Chrome / Edge 94+、Firefox 105+、Safari 16.4+。启动时会探测 Web Worker、WebAssembly（含 SIMD）和 OffscreenCanvas：
不支持的浏览器整页提示；手机会先看到"建议在电脑上使用"的说明页，可以坚持继续；没有 WASM SIMD 的浏览器关闭 OCR 但仍能转普通 PDF。

## 原理

```text
PDF ──pdf.js──▶ PrimitiveDocument ──版面引擎──▶ LayoutDocument ──▶ SemanticDocument ──┬─▶ docx.js ──▶ .docx
                     ▲                                                                   └─▶ remark  ──▶ .md
            扫描页 ───┘ PaddleOCR.js
```

三层中间模型、边界严格；版面引擎全是纯函数，单测不需要真实 PDF。
核心层不产生任何自然语言：进度、警告、错误都是"键 + 参数"，由界面按当前语言渲染。

```text
src/
├─ core/            # 转换引擎，不依赖 React
│  ├─ contracts/    # 三层中间模型
│  ├─ pdf/          # pdf.js 适配：文本、矢量线段、图像、渲染
│  ├─ layout/       # 行、分栏、段落、表格、页眉页脚
│  ├─ semantic/     # 版面结果 → 文档语义
│  ├─ docx/ markdown/ ocr/ converter/
├─ worker/          # Web Worker 与消息协议
├─ i18n/            # 语言检测与四张文案表
├─ ui/ hooks/       # React 界面、能力探测
scripts/            # 静态资源复制、模型下载
tests/              # 单测 + PDF 夹具
docs/               # 架构、中间模型、ADR
```

设计说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/DOCUMENT_IR.md](docs/DOCUMENT_IR.md)，
决策记录在 [docs/adr/](docs/adr/)，后续方向在 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 开发

- TypeScript strict，`npm run typecheck` 兼作 lint；格式化 `npm run format`。
- 推送前运行 `npm run check`；CI 使用同一套格式、测试、类型与构建门禁。
- 测试 `npm test`。版面算法直接喂手搓的 span，不需要 PDF。
  `tests/fixtures/` 里的 PDF 由 `make_fixtures.py` 生成（本机需要 PyMuPDF，不是项目依赖）。
- 新增警告或进度文案要同时改 `src/i18n/messages/` 四张表，类型检查会逼你改全。
- CI 在每次推送时跑格式检查、类型检查、测试和构建。
- 四种界面语言共用一份全英文中立示例 `public/samples/demo.pdf`，由 `scripts/make-demo-pdf.py` 生成（本机需要 PyMuPDF）。
- `docs/social-card.png` 和 `public/og.png` 由 `scripts/make-social-card.py` 生成（同样需要 PyMuPDF）。

项目边界和提交约定见 [CONTRIBUTING.md](CONTRIBUTING.md)，夹具分层、浏览器回归和私有样本规则见 [docs/TESTING.md](docs/TESTING.md)。

欢迎提 Issue 和 PR。改动请尽量小而聚焦——这是个人项目，简单本身就是功能。

## 许可

MIT。第三方依赖许可见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。
