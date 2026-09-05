# -*- coding: utf-8 -*-
"""
生成 1280×640 的社交分享卡。默认英文：docs/social-card.png（英文 README 顶图、GitHub 社交预览）
和 public/og.png（网页 og:image）；另出一张中文版 docs/social-card.zh-CN.png 给中文 README。
依赖 PyMuPDF，只在本机生成时用，不是项目依赖。

    python scripts/make-social-card.py
"""
import os
import shutil

import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OG = os.path.join(ROOT, "public", "og.png")

W, H = 1280, 640
BG = (0.965, 0.961, 0.949)
ACCENT = (0.706, 0.278, 0.122)
INK = (0.137, 0.129, 0.114)
DIM = (0.435, 0.416, 0.376)
OK = (0.184, 0.49, 0.31)

# 每种语言一套文案。CJK 字体里的拉丁字母是全角宽度，中英混排要按段切换字体，
# 所以每行写成 (文本, 字体) 的片段列表。
CARDS = {
    "en": {
        "out": os.path.join(ROOT, "docs", "social-card.png"),
        "lines": [
            [("PDF to Word / Markdown, entirely in your browser", "helv")],
            [("Word, Markdown and images to PDF as well", "helv")],
        ],
        "checks": ["Nothing uploaded", "No sign-up", "Free & open source"],
        "font": "helv",
    },
    "zh-CN": {
        "out": os.path.join(ROOT, "docs", "social-card.zh-CN.png"),
        "lines": [
            [("纯前端", "china-s"), ("PDF", "helv"), ("转", "china-s"),
             ("Word / Markdown", "helv"), ("，文件不出本机", "china-s")],
            [("Word", "helv"), ("、", "china-s"), ("Markdown", "helv"), ("、图片转", "china-s"),
             ("PDF", "helv"), ("也在同一个页面", "china-s")],
        ],
        "checks": ["不上传", "无需注册", "免费开源"],
        "font": "china-s",
    },
}


def draw_runs(page, x, y, runs, size, color):
    """逐段换字体画一行；CJK 字体的空格是全角，段与段之间用固定间距代替空格，标点旁不留"""
    for i, (text, font) in enumerate(runs):
        page.insert_text((x, y), text, fontname=font, fontsize=size, color=color)
        x += fitz.get_text_length(text, fontname=font, fontsize=size)
        nxt = runs[i + 1][0] if i + 1 < len(runs) else ""
        if nxt and nxt[0] not in "，、。" and text[-1] not in "，、。":
            x += 7


def draw_card(card):
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
    draw_runs(page, tx, 268, card["lines"][0], 30, DIM)
    draw_runs(page, tx, 312, card["lines"][1], 26, DIM)

    y = 396
    for i, label in enumerate(card["checks"]):
        cx = tx + i * 300
        page.draw_circle((cx + 12, y - 9), 12, color=None, fill=OK)
        page.draw_polyline([(cx + 6, y - 9), (cx + 10.5, y - 4.5), (cx + 18.5, y - 14)], color=(1, 1, 1), width=2.6)
        page.insert_text((cx + 34, y), label, fontname=card["font"], fontsize=24, color=INK)

    page.draw_line((96, 520), (W - 96, 520), color=(0.85, 0.84, 0.81), width=1)
    page.insert_text((96, 572), "localpdfconverter.com", fontname="hebo", fontsize=28, color=ACCENT)
    page.insert_text((W - 96 - 300, 572), "github.com/zkwi/local-pdf", fontname="helv", fontsize=22, color=DIM)

    pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
    os.makedirs(os.path.dirname(card["out"]), exist_ok=True)
    pix.save(card["out"])
    print(f"written {card['out']} ({pix.width}x{pix.height}, {os.path.getsize(card['out']) / 1024:.0f} KB)")


def main():
    for card in CARDS.values():
        draw_card(card)
    shutil.copyfile(CARDS["en"]["out"], OG)
    print(f"copied english card to {OG}")


if __name__ == "__main__":
    main()
