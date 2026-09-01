# -*- coding: utf-8 -*-
"""
生成端到端验证用的 PDF 夹具。

依赖 PyMuPDF，只在本机生成夹具时用，不是项目依赖，也不进 package.json。
（PyMuPDF 是 AGPL/商业双许可，正式产品链路里不能引入。）

    python tests/fixtures/make_fixtures.py
"""
import os

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))

LATIN = "helv"
LATIN_BOLD = "hebo"
CJK = "china-s"

A4 = (595, 842)


def new_page(doc, size=A4):
    return doc.new_page(width=size[0], height=size[1])


def text(page, x, y, s, size=10.5, font=LATIN, color=(0, 0, 0)):
    page.insert_text((x, y), s, fontname=font, fontsize=size, color=color)


def single_column_en(path):
    doc = fitz.open()
    page = new_page(doc)
    text(page, 72, 90, "Local PDF to Word Conversion", size=20, font=LATIN_BOLD)
    text(page, 72, 120, "1  Introduction", size=13, font=LATIN_BOLD)

    body = [
        "This document is a fixture used to verify the extraction pipeline. It con-",
        "tains a heading, ordinary paragraphs, and a bullet list. The hyphenated",
        "word above should be rejoined when the two lines are merged.",
    ]
    y = 145
    for row in body:
        text(page, 72, y, row)
        y += 15

    y += 12
    second = [
        "A second paragraph starts here after a larger vertical gap, so the layout",
        "engine must treat it as a separate block rather than continuing the first.",
    ]
    for row in second:
        text(page, 72, y, row)
        y += 15

    y += 14
    for item in ["First bullet item", "Second bullet item", "Third bullet item"]:
        text(page, 80, y, "• " + item)
        y += 16

    doc.save(path)
    doc.close()


def single_column_zh(path):
    doc = fitz.open()
    page = new_page(doc)
    text(page, 72, 92, "纯前端 PDF 转 Word 说明", size=20, font=CJK)
    text(page, 72, 126, "一、背景", size=14, font=CJK)

    y = 152
    para1 = [
        "本文件用于验证中文抽取链路。段落里既有中文也有 PDF.js 这类英文词，",
        "拼接规则必须保证中文之间不出现空格，中英之间也不能凭空多出空格。",
    ]
    for row in para1:
        text(page, 72, y, row, size=10.5, font=CJK)
        y += 18

    y += 16
    para2 = [
        "这是第二个段落，与上一段之间留出了明显的行间距，版面分析应当把它",
        "识别成一个独立的段落，而不是接在第一段后面。",
    ]
    for row in para2:
        text(page, 72, y, row, size=10.5, font=CJK)
        y += 18

    y += 18
    for i, item in enumerate(["第一项内容", "第二项内容", "第三项内容"], start=1):
        text(page, 80, y, "%d. %s" % (i, item), size=10.5, font=CJK)
        y += 19

    doc.save(path)
    doc.close()


def two_column(path):
    doc = fitz.open()
    page = new_page(doc)
    text(page, 72, 90, "A Two Column Paper Layout", size=18, font=LATIN_BOLD)

    left = ["Left column line %02d of the article body." % i for i in range(1, 19)]
    right = ["Right column line %02d of the article body." % i for i in range(1, 19)]

    y = 130
    for row in left:
        text(page, 60, y, row, size=9.5)
        y += 14

    y = 130
    for row in right:
        text(page, 320, y, row, size=9.5)
        y += 14

    doc.save(path)
    doc.close()


def bordered_table(path):
    doc = fitz.open()
    page = new_page(doc)
    text(page, 72, 90, "Quarterly Summary", size=16, font=LATIN_BOLD)

    x0, x1, x2, x3 = 72, 220, 360, 500
    ys = [120, 148, 176, 204, 232]

    for y in ys:
        page.draw_line(fitz.Point(x0, y), fitz.Point(x3, y), width=0.8)
    for x in (x0, x1, x2, x3):
        page.draw_line(fitz.Point(x, ys[0]), fitz.Point(x, ys[-1]), width=0.8)

    text(page, x0 + 8, ys[0] + 18, "Quarter", font=LATIN_BOLD)
    text(page, x1 + 8, ys[0] + 18, "Revenue", font=LATIN_BOLD)
    text(page, x2 + 8, ys[0] + 18, "Growth", font=LATIN_BOLD)

    rows = [("Q1", "1,200", "+4%"), ("Q2", "1,410", "+18%"), ("Q3", "1,380", "-2%")]
    for i, (a, b, c) in enumerate(rows):
        y = ys[i + 1] + 18
        text(page, x0 + 8, y, a)
        text(page, x1 + 8, y, b)
        text(page, x2 + 8, y, c)

    # 第二张表：首行横向合并（缺中间竖线）
    ty = [280, 308, 336]
    for y in ty:
        page.draw_line(fitz.Point(x0, y), fitz.Point(x2, y), width=0.8)
    page.draw_line(fitz.Point(x0, ty[0]), fitz.Point(x0, ty[-1]), width=0.8)
    page.draw_line(fitz.Point(x2, ty[0]), fitz.Point(x2, ty[-1]), width=0.8)
    page.draw_line(fitz.Point(x1, ty[1]), fitz.Point(x1, ty[-1]), width=0.8)

    text(page, x0 + 8, ty[0] + 18, "Merged header across two columns", font=LATIN_BOLD)
    text(page, x0 + 8, ty[1] + 18, "left cell")
    text(page, x1 + 8, ty[1] + 18, "right cell")

    doc.save(path)
    doc.close()


def with_image(path):
    doc = fitz.open()
    page = new_page(doc)
    text(page, 72, 90, "Figure Test", size=16, font=LATIN_BOLD)
    text(page, 72, 118, "The image below should be extracted and placed in order.")

    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 240, 160))
    pix.set_rect(fitz.IRect(0, 0, 240, 160), (240, 235, 220))
    pix.set_rect(fitz.IRect(20, 20, 220, 60), (180, 70, 30))
    pix.set_rect(fitz.IRect(20, 80, 140, 140), (60, 110, 160))
    page.insert_image(fitz.Rect(72, 140, 312, 300), pixmap=pix)

    text(page, 72, 320, "Figure 1. A generated placeholder image.", size=9)
    text(page, 72, 350, "Text after the figure continues the reading order.")

    doc.save(path)
    doc.close()


def multipage(path):
    doc = fitz.open()
    for i in range(4):
        page = new_page(doc)
        text(page, 72, 48, "ACME Annual Report 2024", size=9, color=(0.4, 0.4, 0.4))
        text(page, 72, 120, "Section %d" % (i + 1), size=15, font=LATIN_BOLD)
        y = 150
        for j in range(1, 13):
            text(page, 72, y, "Page %d body line %02d with ordinary content." % (i + 1, j))
            y += 15
        text(page, 300, 800, str(i + 1), size=9, color=(0.4, 0.4, 0.4))
    doc.save(path)
    doc.close()


def scanned(path):
    """把一页文字渲染成位图再塞回 PDF，模拟扫描件（没有文字层）"""
    src = fitz.open()
    page = new_page(src)
    text(page, 72, 120, "Scanned Page Without Text Layer", size=18, font=LATIN_BOLD)
    text(page, 72, 160, "This page has been rasterized so no text layer remains.")
    text(page, 72, 185, "Only OCR can recover these words.")
    pix = page.get_pixmap(dpi=150)
    src.close()

    doc = fitz.open()
    out = new_page(doc)
    out.insert_image(fitz.Rect(0, 0, A4[0], A4[1]), pixmap=pix)
    doc.save(path)
    doc.close()


def main():
    jobs = [
        ("single-column-en.pdf", single_column_en),
        ("single-column-zh.pdf", single_column_zh),
        ("two-column.pdf", two_column),
        ("table-bordered.pdf", bordered_table),
        ("with-image.pdf", with_image),
        ("multipage-header-footer.pdf", multipage),
        ("scanned-no-text.pdf", scanned),
    ]
    for name, fn in jobs:
        target = os.path.join(HERE, name)
        fn(target)
        print("generated", name, os.path.getsize(target), "bytes")


if __name__ == "__main__":
    main()
