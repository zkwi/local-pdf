# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Changed

- The ONNX Runtime WASM is no longer shipped with the site; it is loaded from jsDelivr pinned to the exact
  version the OCR SDK was built with (the 26.5 MiB file exceeds Cloudflare Pages' 25 MiB limit).
  `npm run ocr-runtime` copies it into `public/ort/` for hosts that allow it; the app prefers the local copy.

## [0.1.0] — 2026-09-02

First public release.

### Added

- PDF → Word (.docx) conversion that runs entirely in the browser: pdf.js extraction, an in-house layout engine
  (lines, columns, reading order, paragraphs, headings, lists, ruled tables with merged cells, images,
  headers/footers), docx.js output.
- Tables that only have horizontal rules (three-line tables in research reports, brokerage statements,
  financial statements): rows come from the rules, columns from text alignment, with conservative acceptance
  so ordinary text between two separator lines is left alone.
- PDF → Markdown output from the same recognition result (remark; zipped with images and a `manifest.json`
  carrying page, bounding box and confidence per block).
- Per-page OCR for scanned pages with PaddleOCR.js (PP-OCRv6 tiny / small); models are downloaded once,
  verified by SHA-256 and kept in Cache Storage; optional self-hosting via `npm run ocr-models`.
- OCR on very tall pages (WeChat "long image" PDFs, thousands of points high) renders and recognises the page
  in overlapping strips instead of one downscaled bitmap, so small text stays legible.
- Interface in Simplified Chinese, Traditional Chinese, English and Japanese; the core never produces
  natural language, only message keys.
- Capability detection on start-up: unsupported browsers get a clear notice, phones get a "use a computer"
  page they can dismiss, browsers without wasm SIMD keep working with OCR disabled.
- Conversion report per file: confidence, element counts and warnings per page; finished jobs show a one-line
  summary without opening the report.
- Batch queue with progress and cancellation; password-protected PDFs; the whole page is a drop target; the tab
  title shows queue progress and the browser asks before closing a page with conversions still running.

### Robustness (from testing on 50 real documents before release)

- Text layers containing control characters (fonts often map tabs and bullets to U+0002/U+0003) no longer
  produce a DOCX that Word refuses to open; text is sanitised at extraction and again in both writers.
- Every image had `docPr id="1"` (a docx.js quirk); ids are now unique.
- Page numbers embedded in headers/footers such as `- 85 -` or `Title 2025 - 85 -` become a Word `PAGE`
  field by comparing digit groups across pages.
- Pages larger than Word's 22-inch limit are laid out on A4 pages with flowing content and a warning,
  instead of producing hundreds of broken pages.
- Wingdings / Symbol bullets that live in the private-use area are mapped to ordinary Unicode symbols
  instead of showing as boxes.
- Image tiles that touch or overlap are merged into one image before cropping, and pieces under 12 pt are
  dropped; large crops fall back to JPEG when it is clearly smaller than PNG.
- In automatic OCR mode a page that yields very little text (covers, full-page charts) is kept as an image
  instead of being replaced by a handful of recognised labels.
