# -*- coding: utf-8 -*-
"""
生成 1280×640 的社交分享卡：docs/social-card.png（README 顶图、GitHub 社交预览）和 public/og.png（网页 og:image）。
依赖 PyMuPDF，只在本机生成时用，不是项目依赖。

    python scripts/make-social-card.py
"""
import os
import shutil

import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "social-card.png")
OG = os.path.join(ROOT, "public", "og.png")

W, H = 1280, 640
BG = (0.965, 0.961, 0.949)
ACCENT = (0.706, 0.278, 0.122)
INK = (0.137, 0.129, 0.114)
DIM = (0.435, 0.416, 0.376)
OK = (0.184, 0.49, 0.31)


def main():
    doc = fitz.open()
    page = doc.new_page(width=W, height=H)
    page.draw_rect(fitz.Rect(0, 0, W, H), color=None, fill=BG)
    # 顶部一抹暖色光晕，和网页背景一致
    page.draw_rect(fitz.Rect(0, 0, W, 6), color=None, fill=ACCENT)

    # 品牌标：圆角方块 + 白色页面 + 锁
    x0, y0, s = 96, 150, 150
    page.draw_rect(fitz.Rect(x0, y0, x0 + s, y0 + s), color=None, fill=ACCENT, radius=0.22)
    k = s / 64
    page.draw_polyline(
        [(x0 + 20 * k, y0 + 14 * k), (x0 + 37 * k, y0 + 14 * k), (x0 + 46 * k, y0 + 23 * k),
         (x0 + 46 * k, y0 + 50 * k), (x0 + 20 * k, y0 + 50 * k), (x0 + 20 * k, y0 + 14 * k)],
        color=None, fill=(1, 1, 1), closePath=True,
    )
    page.draw_polyline([(x0 + 37 * k, y0 + 14 * k), (x0 + 37 * k, y0 + 23 * k), (x0 + 46 * k, y0 + 23 * k)],
                       color=ACCENT, width=2.5 * k)
    page.draw_rect(fitz.Rect(x0 + 25 * k, y0 + 33 * k, x0 + 39 * k, y0 + 44 * k), color=None, fill=ACCENT, radius=0.2)
    page.draw_circle((x0 + 32 * k, y0 + 29.5 * k), 4 * k, color=ACCENT, width=2.5 * k)
    page.draw_rect(fitz.Rect(x0 + 27 * k, y0 + 29.5 * k, x0 + 37 * k, y0 + 34 * k), color=None, fill=BG)
    page.draw_rect(fitz.Rect(x0 + 25 * k, y0 + 33 * k, x0 + 39 * k, y0 + 44 * k), color=None, fill=ACCENT, radius=0.2)

    tx = 292
    page.insert_text((tx, 214), "Local PDF", fontname="hebo", fontsize=76, color=INK)
    page.insert_text((tx, 268), "PDF to Word / Markdown, entirely in your browser",
                     fontname="helv", fontsize=30, color=DIM)
    # CJK 字体里的拉丁字母是全角宽度，中英混排要分段用不同字体
    x = tx
    # CJK 字体的空格是全角，段与段之间用固定间距代替空格
    for run, font in [("纯前端", "china-s"), ("PDF", "helv"), ("转", "china-s"),
                      ("Word / Markdown", "helv"), ("，文件不出本机", "china-s")]:
        page.insert_text((x, 312), run, fontname=font, fontsize=26, color=DIM)
        x += fitz.get_text_length(run, fontname=font, fontsize=26) + (0 if run.startswith("，") else 7)

    y = 396
    for i, label in enumerate(["Nothing uploaded", "No sign-up", "Free & open source"]):
        cx = tx + i * 300
        page.draw_circle((cx + 12, y - 9), 12, color=None, fill=OK)
        page.draw_polyline([(cx + 6, y - 9), (cx + 10.5, y - 4.5), (cx + 18.5, y - 14)], color=(1, 1, 1), width=2.6)
        page.insert_text((cx + 34, y), label, fontname="helv", fontsize=24, color=INK)

    page.draw_line((96, 520), (W - 96, 520), color=(0.85, 0.84, 0.81), width=1)
    page.insert_text((96, 572), "localpdfconverter.com", fontname="hebo", fontsize=28, color=ACCENT)
    page.insert_text((W - 96 - 300, 572), "github.com/zkwi/local-pdf", fontname="helv", fontsize=22, color=DIM)

    pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    pix.save(OUT)
    shutil.copyfile(OUT, OG)
    print(f"written {OUT} ({pix.width}x{pix.height}, {os.path.getsize(OUT) / 1024:.0f} KB) and public/og.png")


if __name__ == "__main__":
    main()
