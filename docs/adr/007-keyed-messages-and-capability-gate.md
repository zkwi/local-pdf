# ADR 007：核心层只发"键 + 参数"，界面按语言渲染；启动时探测能力

日期：2026-09-02 · 状态：已采纳

## 背景

产品面向普通用户，界面要支持多语言（简中 / 繁中 / 英 / 日），
而进度、警告、错误原本是核心层用中文拼好的字符串，界面只能原样显示。

另外手机浏览器对内存和 WebAssembly 的限制多，大文件和扫描件很容易失败，
但用户拖进去之前无从知道。

## 决定

### 1. 核心层不产生自然语言

- `ConversionWarning = { code, pageIndex?, params? }`，没有 `message`。
- `ConversionProgress = { stage, key, params?, ... }`，没有 `message`。
- Worker 错误 `{ code, detail? }`，`detail` 是原始错误文本，只在 `unknown` 时附在译文后面。
- `OcrProgress` 同样是 `key + params`。

界面用 `t('warning.' + code, params)` / `t('progress.' + key, params)` 渲染。
`params` 里的 `page` 从 1 起，`reason` 是原始错误文本（不翻译）。

输出文件里唯一的自然语言是 Markdown 图片的替代文本，跟随 `ConvertOptions.locale`。
DOCX 的 core-properties 描述改成语言无关的 `Local PDF · 文件名`。

### 2. 文案表用类型强制齐全

`src/i18n/messages/zh-CN.ts` 是主表，`type Messages = Record<keyof typeof zhCN, string>`，
其他语言必须实现同一类型，少一个键编译不过。`tests/i18n.test.ts` 再核对每条文案的占位符集合与主表一致。

不引入 i18n 库：四张扁平表 + 一个 `{name}` 插值函数 + React context 就够了，
复数、日期这类需求现在没有。

语言检测：`localStorage` 里的选择 → `navigator.languages`（zh-TW/HK/MO/Hant 归繁中，其余 zh 归简中）→ 英文兜底。
界面语言同时决定 OCR 的默认识别语言（`ocrLanguage: 'auto'`）。

### 3. 精简界面

普通用户只需要做一个决定：转成 Word 还是 Markdown。这项放在拖放区正下方。
其余全部折叠进「更多选项」，标签用大白话（"扫描件识别"、"保留版式"、"只要文字"），
不出现 OCR 引擎名、渲染倍率、页数上限这类技术项——它们保留在 `ConvertOptions` 里，只是不再暴露到界面。
设置改动过就出现"恢复默认"。

### 4. 启动时探测能力

`src/ui/capabilities.ts` 同步探测：Worker、WebAssembly、wasm SIMD（validate 一段最小 v128 模块）、
OffscreenCanvas、createImageBitmap、是否手机、`deviceMemory`。

| 情况 | 处理 |
| --- | --- |
| 缺 Worker / wasm / OffscreenCanvas / createImageBitmap | 整页提示换浏览器，不渲染应用 |
| 手机（UA、`userAgentData.mobile`、粗指针 + 小屏） | 先给一页说明 + 复制链接；点"仍要继续"才放行，本会话记住 |
| 没有 wasm SIMD | ONNX Runtime 起不来 → OCR 强制关闭并提示，普通 PDF 照转 |
| `deviceMemory ≤ 2` | 顶部提示一次只转一个文件 |

手机不做硬拦截：小的文字型 PDF 在手机上是能转的，拦死反而是损失。

## 代价

- 加新警告 / 进度必须同时改四张文案表（类型会逼你改）。
- `params.reason` 里的原始错误文本是英文（来自 pdf.js / SDK），不翻译。
