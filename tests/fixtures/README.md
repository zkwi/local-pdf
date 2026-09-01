# 测试夹具

端到端验证用的 PDF，由 `make_fixtures.py` 生成：

```bash
python tests/fixtures/make_fixtures.py
```

生成脚本依赖 PyMuPDF。**它不是项目依赖**，也不在 `package.json` 里——
PyMuPDF 是 AGPL/商业双许可，不能进产品链路（见 `docs/adr/001-permissive-license-core.md`）。

| 文件 | 覆盖的场景 | 入库 |
| --- | --- | --- |
| `single-column-en.pdf` | 英文段落、标题、项目符号、行尾断词 | ✅ |
| `single-column-zh.pdf` | 中文段落、中英混排、中文编号标题 | ✅ |
| `two-column.pdf` | 双栏 + 跨栏标题 | ✅ |
| `table-bordered.pdf` | 有框线表格、横向合并单元格 | ✅ |
| `with-image.pdf` | 图片抽取与阅读顺序 | ✅ |
| `multipage-header-footer.pdf` | 多页、页眉、页码 | ✅ |
| `scanned-no-text.pdf` | 无文字层的扫描件（OCR 路径） | ❌ 6.5 MB，跑脚本现生成 |

单元测试（`npm test`）不依赖这些 PDF——版面算法是纯函数，测试里直接构造 span。
这些夹具用于人工端到端验证。

## 还没覆盖的场景

真实语料里还应该补上：加密 PDF、损坏 PDF、旋转页面、竖排文字、
无框线表格、纵向合并单元格、100 页以上的大文件、中英文混合扫描件。
