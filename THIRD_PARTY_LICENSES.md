# 第三方依赖许可

统计自 `package-lock.json`，核对日期 2026-09-01。

## 硬性约束

**运行时依赖不得包含 AGPL、GPL-only、SSPL 或 source-available 许可。**
理由见 [docs/adr/001-permissive-license-core.md](docs/adr/001-permissive-license-core.md)。

加新依赖前请先跑：

```bash
node -e "const l=require('./package-lock.json');for(const[p,i]of Object.entries(l.packages||{})){const x=Array.isArray(i.license)?i.license.join('/'):(i.license||'UNKNOWN');if(!i.dev&&/AGPL|SSPL|^GPL/.test(x))console.log(p,x)}"
```

无输出即通过。

## 直接依赖

### 运行时

| 包 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| `pdfjs-dist` | 6.3.289 | Apache-2.0 | PDF 解析、页面渲染 |
| `docx` | 9.7.1 | MIT | 生成 DOCX |
| `tesseract.js` | 7.0.0 | Apache-2.0 | 扫描件 OCR（按需动态加载） |
| `react` / `react-dom` | 19.2.8 | MIT | 界面 |

### 开发时

| 包 | 版本 | 许可 |
| --- | --- | --- |
| `vite` | 7.3.6 | MIT |
| `@vitejs/plugin-react` | 5.2.0 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `vitest` | 4.1.11 | MIT |
| `@types/react`、`@types/react-dom` | 19.2.x | MIT |

## 传递依赖许可分布

共 193 个包：

| 许可 | 数量 |
| --- | --- |
| MIT | 171 |
| Apache-2.0 | 8 |
| ISC | 8 |
| CC-BY-4.0 | 1（`caniuse-lite`，仅开发时） |
| MIT OR GPL-3.0-or-later | 1（`jszip`，双许可，取 MIT） |
| MIT AND Zlib | 1（`pako`） |
| BlueOak-1.0.0 | 1（`sax`） |
| BSD-3-Clause | 1（仅开发时） |
| BSD-2-Clause | 1 |

**没有 AGPL / GPL-only / SSPL。**

## 非依赖，但用到的东西

| 项目 | 许可 | 关系 |
| --- | --- | --- |
| PyMuPDF | AGPL / 商业 | 只在本机跑 `tests/fixtures/make_fixtures.py` 生成测试 PDF，不在 `package.json` 里，不进产品 |
| BentoPDF、PDFCraft、pdf2docx | AGPL / MIT+AGPL 依赖链 | 仅作参考实现和竞品对照，未复制任何代码 |

## OCR 语言包

Tesseract 的 `*.traineddata` 由 Google 发布，Apache-2.0。默认从 tesseract.js 的 CDN
按需下载（只下载、不上传），也可以自托管，见 README。
