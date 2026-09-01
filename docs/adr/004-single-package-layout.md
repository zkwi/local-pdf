# ADR 004：单包 + 模块边界，不用 monorepo

日期：2026-09-01 · 状态：已采纳

## 背景

原始规划是 pnpm workspace，把 contracts / pdfjs-adapter / layout-engine /
docx-writer / converter 拆成独立包。

## 决定

单个 npm 包，用 `src/core/` 下的目录结构和依赖方向约定来维持同样的边界。

## 理由

拆包真正带来的价值是「独立发版」和「机器强制的依赖方向」。这个项目：

- 没有独立发版需求，所有包永远一起发
- 依赖方向靠目录约定 + code review 就能守住，ADR 003 里写清楚了
- 本机没有 pnpm，多一个必装工具就是多一道门槛

而拆包的成本是实打实的：多份 package.json / tsconfig、构建编排、
IDE 跳转变慢、改一个类型要动五个包。

## 迁移成本

如果以后真需要拆，代价很低：`core/` 下每个目录本来就是自洽的，
导入路径已经统一走 `@core/*` 别名，拆的时候基本只是移动文件 + 加 package.json。

## 代价

依赖方向靠约定而非工具强制。如果哪天 `core/layout` 里出现了 `import ... from 'pdfjs-dist'`，
需要靠 review 发现。真出问题时可以加一条 eslint `no-restricted-imports` 规则。
