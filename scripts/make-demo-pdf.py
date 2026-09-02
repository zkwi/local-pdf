"""Generate ``public/samples/demo.pdf`` for the in-app sample action.

The sample is intentionally English-only so the same binary is neutral across all
four interface locales. It uses built-in PDF fonts and covers the structures the
converter should recognise: headings, paragraphs, lists, a ruled table, an image,
and repeating headers and footers.

PyMuPDF is a local authoring dependency only. It is not part of the web app.

    python scripts/make-demo-pdf.py
"""

from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "samples" / "demo.pdf"

A4 = (595, 842)
REGULAR = "helv"
BOLD = "hebo"
INK = (0.12, 0.105, 0.085)
MUTED = (0.40, 0.37, 0.32)
LINE = (0.78, 0.74, 0.67)
PAPER = (0.98, 0.965, 0.94)
ACCENT = (0.706, 0.278, 0.122)


def write(page, x, y, value, size=10.5, font=REGULAR, color=INK):
    page.insert_text((x, y), value, fontname=font, fontsize=size, color=color)


def header_footer(page, number):
    write(page, 72, 39, "LOCAL PDF  /  SAMPLE DOCUMENT", size=8, font=BOLD, color=MUTED)
    page.draw_line((72, 47), (523, 47), color=LINE, width=0.5)
    write(page, 72, 810, "Files stay on your device", size=8, color=MUTED)
    write(page, 500, 810, f"{number} / 2", size=8, font=BOLD, color=MUTED)


def page_one(document):
    page = document.new_page(width=A4[0], height=A4[1])
    header_footer(page, 1)

    write(page, 72, 99, "Turn PDFs into editable documents", size=23, font=BOLD)
    write(
        page,
        72,
        124,
        "A compact sample for Word, Markdown, and image export",
        size=11,
        color=MUTED,
    )

    paragraphs = [
        "This document lets you try Local PDF without choosing one of your own files. It",
        "contains common document structures and a clean text layer, so you can compare",
        "the source with the editable result after conversion.",
        "Everything runs in your browser. The file, extracted text, and generated output",
        "remain on this device throughout the conversion.",
    ]
    y = 164
    for line in paragraphs:
        write(page, 72, y, line)
        y += 16

    write(page, 72, 265, "What this sample covers", size=14, font=BOLD)
    items = [
        ("01", "Headings, paragraphs, and natural reading order"),
        ("02", "Numbered items and line wrapping across a paragraph"),
        ("03", "A ruled table with a merged note row"),
        ("04", "An embedded image in the correct document position"),
        ("05", "Repeating headers, footers, and page numbers"),
    ]
    y = 292
    for number, label in items:
        write(page, 74, y, number, size=9, font=BOLD, color=ACCENT)
        write(page, 104, y, label)
        y += 20

    write(page, 72, 420, "Sample table", size=14, font=BOLD)
    left, right = 72, 523
    columns = [left, 207, 427, right]
    rows = [440, 466, 492, 518, 547]
    for row_y in rows:
        page.draw_line((left, row_y), (right, row_y), color=(0.28, 0.26, 0.23), width=0.6)
    for column_x in (left, right):
        page.draw_line(
            (column_x, rows[0]),
            (column_x, rows[-1]),
            color=(0.28, 0.26, 0.23),
            width=0.6,
        )
    for column_x in columns[1:-1]:
        page.draw_line(
            (column_x, rows[0]),
            (column_x, rows[-2]),
            color=(0.28, 0.26, 0.23),
            width=0.6,
        )
    page.draw_rect(fitz.Rect(left, rows[0], right, rows[1]), color=None, fill=PAPER)

    cells = [
        ("Element", "Expected result", "Ready"),
        ("Text layer", "Selectable paragraphs", "Yes"),
        ("Ruled table", "Rows and columns rebuilt", "Yes"),
    ]
    for row_index, row in enumerate(cells):
        font = BOLD if row_index == 0 else REGULAR
        baseline = rows[row_index] + 17
        write(page, columns[0] + 7, baseline, row[0], size=9.5, font=font)
        write(page, columns[1] + 7, baseline, row[1], size=9.5, font=font)
        write(page, columns[2] + 7, baseline, row[2], size=9.5, font=font)
    write(
        page,
        left + 7,
        rows[-2] + 19,
        "Merged note: complex layouts may need a quick review after conversion.",
        size=9.5,
        color=MUTED,
    )

    page.draw_rect(
        fitz.Rect(72, 584, 523, 653),
        color=LINE,
        fill=PAPER,
        width=0.6,
        radius=0.12,
    )
    write(page, 90, 611, "LOCAL-FIRST BY DESIGN", size=9, font=BOLD, color=ACCENT)
    write(page, 90, 635, "No account, upload endpoint, watermark, or usage limit.", size=11)
    return page


def chart_pixmap():
    """Render a small chart as a bitmap so the sample contains a real image."""
    temporary = fitz.open()
    page = temporary.new_page(width=330, height=180)
    page.draw_rect(fitz.Rect(0, 0, 330, 180), color=None, fill=PAPER)
    write(page, 22, 25, "CONVERSIONS COMPLETED", size=9, font=BOLD, color=MUTED)
    baseline = 148
    values = [44, 70, 57, 96, 78]
    for index, value in enumerate(values):
        x = 30 + index * 57
        page.draw_rect(
            fitz.Rect(x, baseline - value, x + 34, baseline),
            color=None,
            fill=ACCENT,
        )
        write(page, x + 8, baseline + 16, f"Q{index + 1}", size=8, color=MUTED)
        write(page, x + 9, baseline - value - 7, str(value), size=8, font=BOLD, color=INK)
    page.draw_line((24, baseline), (310, baseline), color=MUTED, width=0.8)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    temporary.close()
    return pixmap


def page_two(document):
    page = document.new_page(width=A4[0], height=A4[1])
    header_footer(page, 2)

    write(page, 72, 99, "Images, headers, and footers", size=20, font=BOLD)
    write(
        page,
        72,
        129,
        "The chart below is an embedded raster image. Its placement and caption should",
    )
    write(page, 72, 145, "remain in reading order when the document is converted.")

    page.insert_image(fitz.Rect(72, 178, 402, 358), pixmap=chart_pixmap())
    write(page, 72, 376, "Figure 1. A simple embedded chart", size=9, color=MUTED)

    write(page, 72, 430, "Before you convert", size=14, font=BOLD)
    checklist = [
        "Choose Word for an editable document with reconstructed structure.",
        "Choose Markdown for portable text plus extracted image files.",
        "Choose Images to render selected pages as PNG or JPEG.",
        "Review low-confidence pages against the original document.",
    ]
    y = 460
    for item in checklist:
        write(page, 76, y, "-", font=BOLD, color=ACCENT)
        write(page, 94, y, item)
        y += 22

    page.draw_rect(
        fitz.Rect(72, 572, 523, 674),
        color=ACCENT,
        fill=(0.995, 0.975, 0.96),
        width=0.8,
        radius=0.08,
    )
    write(page, 92, 604, "READY TO TRY YOUR OWN FILE?", size=10, font=BOLD, color=ACCENT)
    write(page, 92, 632, "Drop it anywhere on the page. Local PDF will route it to the", size=10.5)
    write(page, 92, 649, "matching tool while keeping every byte on this device.", size=10.5)
    return page


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    document = fitz.open()
    page_one(document)
    page_two(document)
    document.set_metadata(
        {
            "title": "Local PDF sample document",
            "author": "Local PDF",
            "subject": "A language-neutral conversion sample",
        }
    )
    document.save(OUT, garbage=4, deflate=True)
    document.close()
    print(f"written {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
