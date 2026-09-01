# pdf2word

纯前端的 PDF → Word（DOCX）转换工具。PDF 解析、版面分析、DOCX 生成、OCR 全部在浏览器里完成，
文件不会上传到任何服务器——代码里根本没有上传接口。

![界面](docs/screenshot.png)

## 快速开始

```bash
npm install
npm run dev
```

打开 <http://localhost:5173>，把 PDF 拖进去即可。

```bash
npm run build     # 类型检查 + 打包到 dist/
npm run preview   # 本地预览打包结果
npm test          # 版面算法单测
```

`dist/` 是纯静态目录，扔到任意静态服务器（或对象存储）即可，不需要后端。
`base` 用的是相对路径，放在子目录下也能跑。

## 它能做什么

| 能力 | 状态 |
| --- | --- |
| 段落、标题、列表识别 | ✅ |
| 中英文混排的空格处理 | ✅ 中文之间不补空格，西文按字距补 |
| 西文行尾断词合并 | ✅ `con-` + `tains` → `contains` |
| 多栏（含跨栏标题）阅读顺序 | ✅ XY-Cut 版面切分 |
| 有框线表格、合并单元格 | ✅ 从矢量框线还原网格 |
| 图片 | ✅ 按页面坐标裁剪渲染结果 |
| 跨页页眉页脚、页码 | ✅ 页码写成 Word 的 PAGE 域 |
| 扫描件 OCR | ✅ 逐页判断，只对没有文字层的页面做 |
| 加密 PDF | ✅ 界面上补密码后重试 |
| 批量转换、进度、取消 | ✅ |

## 它做不到什么

这些是设计上的取舍，不是"还没做"：

- **无框线表格默认不识别。** 靠对齐推断表格的误判率很高，一旦判错，输出会比不识别更难修。需要时可以在代码里打开 `detectBorderlessTables`（当前实现为占位，见 ROADMAP）。
- **不嵌入字体。** DOCX 里只写字体名，换机器后换行位置会变。这是可编辑模式的固有代价。
- **公式、复杂矢量图不可编辑。** 按图片处理。
- **竖排、旋转文字会被压平**成普通段落，并在报告里给出警告。
- **OCR 一定有误差。** 重要文件请对照原件核对。
- **文字颜色不提取。** pdf.js 的文本接口不带颜色，要拿到得把 `showText` 和颜色算子对齐，代价大于收益。

每份文件转换完都有一份「转换报告」，逐页给出把握度、栏数、各类元素数量和警告。**把握度低的页面建议人工核对**，这比让算法硬猜更省事。

## 隐私

- 没有任何上传代码，可以在浏览器网络面板里自行确认。
- pdf.js 的 CMap、标准字体、WASM 都自托管在 `public/pdfjs/`（`npm install` 时自动复制）。
- 唯一的对外请求是 **OCR 语言包**：默认从 tesseract.js 的 CDN 下载（只下载，不上传）。
  想彻底离线，见下方自托管说明。

### 自托管 OCR 资源

1. 把 tesseract.js 的 `worker.min.js`、`tesseract-core*` 和需要的 `*.traineddata.gz`
   放到 `public/` 下，形成：

   ```text
   public/
     worker.min.js
     tesseract-core/…
     tessdata/eng.traineddata.gz
     tessdata/chi_sim.traineddata.gz
   ```

2. 把 `DEFAULT_OPTIONS.ocrAssetBase` 改成你的静态资源根（以 `/` 结尾），
   或在界面上加一个输入项透传给 `ConvertOptions.ocrAssetBase`。

设置之后 OCR 全程无外网请求。

## 目录结构

```text
src/
├─ core/                 # 转换引擎，不依赖 React，可独立复用
│  ├─ contracts/         # 三层中间模型的类型定义（唯一的跨层契约）
│  ├─ geometry/          # 坐标、单位换算、统计
│  ├─ pdf/               # pdf.js 适配：文本、矢量线段、图像、渲染
│  ├─ layout/            # 自研版面引擎：行、分栏、段落、表格、页眉页脚
│  ├─ semantic/          # 版面结果 → Word 语义模型
│  ├─ docx/              # docx.js 适配：样式、字体映射、写出
│  ├─ ocr/               # OCR 触发判断 + Tesseract 适配器
│  └─ converter/         # 串起整条流水线，负责进度、取消、报告
├─ worker/               # Web Worker 与消息协议
├─ ui/ hooks/            # React 界面
tests/                   # 版面算法单测 + PDF 夹具
docs/                    # 架构、中间模型、质量分级、ADR
```

详细设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 和 [docs/DOCUMENT_IR.md](docs/DOCUMENT_IR.md)。

## 测试

```bash
npm test
```

版面算法都是纯函数，单测直接构造 span 输入，不依赖真实 PDF。

端到端夹具在 `tests/fixtures/`，用 `make_fixtures.py` 生成（需要本机装 PyMuPDF，
**不是项目依赖**——PyMuPDF 是 AGPL/商业双许可，不能进产品链路）：

```bash
python tests/fixtures/make_fixtures.py
```

## 许可

MIT。第三方依赖许可见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)，
运行时依赖全部是宽松许可，没有 AGPL/GPL/SSPL。
