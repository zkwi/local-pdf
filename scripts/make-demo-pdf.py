# -*- coding: utf-8 -*-
"""
生成页面上"试试示例 PDF"用的 public/samples/demo.pdf：两页，中英混排，
含标题、段落、列表、有框线表格、图片和页眉页脚，覆盖转换器能识别的每一类元素。

依赖 PyMuPDF，只在本机生成时用，不是项目依赖（PyMuPDF 是 AGPL/商业双许可）。

    python scripts/make-demo-pdf.py
"""
import os

import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "samples", "demo.pdf")

A4 = (595, 842)
LATIN = "helv"
LATIN_BOLD = "hebo"
CJK = "china-s"
GREY = (0.45, 0.45, 0.45)
ACCENT = (0.706, 0.278, 0.122)


def text(page, x, y, s, size=10.5, font=CJK, color=(0, 0, 0)):
    page.insert_text((x, y), s, fontname=font, fontsize=size, color=color)


def header_footer(page, n):
    text(page, 72, 40, "Local PDF · 示例文档 / Sample document", size=8.5, color=GREY)
    page.draw_line((72, 46), (523, 46), color=(0.8, 0.8, 0.8), width=0.5)
    text(page, 290, 810, f"- {n} -", size=9, font=LATIN, color=GREY)


def page_one(doc):
    page = doc.new_page(width=A4[0], height=A4[1])
    header_footer(page, 1)
    text(page, 72, 95, "把 PDF 变成可编辑的 Word", size=22)
    text(page, 72, 118, "Turn a PDF into editable Word and Markdown, in your browser", size=11, font=LATIN, color=GREY)

    y = 155
    for row in [
        "这是一份用来试用的示例文档。它包含标题、段落、项目列表、一张有框线的表格和一",
        "张图片。转换完成后，可以在 Word 或 Markdown 里检查每一种元素的还原效果。",
    ]:
        text(page, 72, y, row)
        y += 17

    y += 8
    for row in [
        "This sample mixes Chinese and English so you can see how the converter joins",
        "lines, keeps list markers and rebuilds tables. Nothing in this file ever leaves",
        "your computer: parsing, layout analysis and file generation all run locally.",
    ]:
        text(page, 72, y, row, font=LATIN)
        y += 15

    y += 14
    text(page, 72, y, "转换器会识别的元素 / What gets recognised", size=13)
    y += 22
    for item in [
        "标题、段落和阅读顺序 / Headings, paragraphs and reading order",
        "项目列表，包括中文和西文的编号方式 / Lists with Chinese or Latin markers",
        "有框线的表格，含合并单元格 / Ruled tables, merged cells included",
        "图片，按页面上的位置裁剪 / Images cropped where they appear",
        "跨页重复的页眉页脚与页码 / Repeating headers, footers and page numbers",
    ]:
        text(page, 80, y, "• " + item)
        y += 17

    y += 16
    text(page, 72, y, "示例表格 / Sample table", size=13)
    y += 14
    cols = [72, 200, 400, 523]
    rows = [y, y + 22, y + 44, y + 66, y + 88]
    for r in rows:
        page.draw_line((cols[0], r), (cols[-1], r), color=(0.2, 0.2, 0.2), width=0.6)
    for c in cols:
        page.draw_line((c, rows[0]), (c, rows[-1]), color=(0.2, 0.2, 0.2), width=0.6)
    cells = [
        ["项目 / Item", "说明 / Description", "状态 / Status"],
        ["文字层 / Text layer", "直接读取，精确到字符 / Read directly", "支持 / Yes"],
        ["扫描页 / Scanned page", "PaddleOCR 逐页识别 / OCR per page", "支持 / Yes"],
        ["无线表格 / Unruled table", "误判代价高，暂不识别 / Not detected", "计划中 / Planned"],
    ]
    for i, row in enumerate(cells):
        for j, cell in enumerate(row):
            text(page, cols[j] + 6, rows[i] + 15, cell, size=9.5)
    return page


def chart_pixmap():
    """画一张简单的柱状图，渲染成位图，让示例里有一张真正的图片。"""
    tmp = fitz.open()
    p = tmp.new_page(width=300, height=180)
    p.draw_rect(fitz.Rect(0, 0, 300, 180), color=None, fill=(0.98, 0.97, 0.95))
    base = 150
    values = [42, 68, 55, 90, 73]
    for i, v in enumerate(values):
        x = 30 + i * 52
        p.draw_rect(fitz.Rect(x, base - v, x + 32, base), color=None, fill=ACCENT)
        p.insert_text((x + 4, base + 16), f"Q{i + 1}", fontname=LATIN, fontsize=9, color=GREY)
        p.insert_text((x + 4, base - v - 6), str(v), fontname=LATIN, fontsize=8, color=(0.3, 0.3, 0.3))
    p.draw_line((24, base), (290, base), color=GREY, width=0.8)
    p.insert_text((24, 22), "Conversions per quarter", fontname=LATIN_BOLD, fontsize=10)
    pix = p.get_pixmap(matrix=fitz.Matrix(2, 2))
    tmp.close()
    return pix


def page_two(doc):
    page = doc.new_page(width=A4[0], height=A4[1])
    header_footer(page, 2)
    text(page, 72, 95, "图片与页眉页脚 / Images, headers and footers", size=16)
    y = 125
    for row in [
        "下面这张图是位图，转换后会按原位置放进 Word；页顶的灰色小字和页脚的页码在每一页重复，",
        "会被识别成页眉页脚，页码写成 Word 的页码域，而不是把 1、2 写死。",
    ]:
        text(page, 72, y, row)
        y += 17

    page.insert_image(fitz.Rect(72, 175, 372, 355), pixmap=chart_pixmap())
    text(page, 72, 372, "图 1  示例图表 / Figure 1  A sample chart", size=9, color=GREY)

    y = 410
    text(page, 72, y, "接下来 / What next", size=13)
    y += 22
    for row in [
        "把自己的 PDF 拖进页面即可。扫描件会自动识别文字，第一次需要下载识别组件。",
        "转换完成后打开「转换报告」，把握度低的页面建议对照原件核对。",
        "Drop your own PDF onto the page. Scanned pages are recognised automatically;",
        "the first time downloads the recognition components. Check the report when done.",
    ]:
        text(page, 72, y, row, font=LATIN if row[0].isascii() else CJK)
        y += 16
    return page


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = fitz.open()
    page_one(doc)
    page_two(doc)
    doc.set_metadata({"title": "Local PDF sample document", "author": "Local PDF"})
    doc.save(OUT, garbage=4, deflate=True)
    print(f"written {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
