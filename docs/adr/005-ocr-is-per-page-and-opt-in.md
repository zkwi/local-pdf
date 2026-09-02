# ADR 005：OCR 逐页判定，且默认只补不抢

日期：2026-09-01 · 状态：已采纳（引擎部分被 ADR 006 取代：现在只用 PaddleOCR.js）

## 背景

"整份文档是不是扫描件"是个错误的问题。真实文档里：

- 扫描件里夹着几页原生文字（比如后补的附录）
- 原生文档里夹着几页扫描（比如插入的盖章页）
- 文字层存在但编码坏了（复制出来是乱码）

三种情况都常见。

## 决定

按页计算文本健康度，逐页决定：

```ts
interface TextHealth {
  charCount: number;          // 非空白字符数
  printableRatio: number;
  replacementRatio: number;   // U+FFFD 和 C0 控制字符占比
  imageCoverage: number;      // 图像面积 / 页面面积
  textCoverage: number;
  suspicious: boolean;
}
```

`auto` 策略下触发 OCR 的条件：

- 完全没有文字，且页面上有图（`charCount === 0 && imageCoverage > 0.1`）
- 文字极少但大面积是图（`charCount < 24 && imageCoverage > 0.35`）
- 编码可疑（乱码率 > 12%，或字符数够多但可打印率 < 70%）

另有 `off` / `force` 两个显式策略。

OCR 结果与原生文字合并时做空间去重：OCR 词的中心点落在某个原生 span 的框里就丢弃，
避免同一内容出现两次。

## 理由

对所有页面 OCR 会慢十倍且质量更差（原生文字是精确的，OCR 一定有误差）。
默认只在原生文字确实不可用时才补。

## 关于隐私

OCR 模型需要下载。这是**下载**不是上传，文档内容不出本机。
模型的下载、校验、缓存和自托管方式见 ADR 006；界面上明确写出会下载多大、只下载不上传；
OCR 模块用动态 `import()`，不开 OCR 时不进包。
