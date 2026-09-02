# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added

- A feature strip under the drop zone (local, editable Word, OCR, free) replaces the three small trust
  chips; the same four points are in the static English content for search engines.
- Slow conversions show elapsed time and an estimate of the time left based on the speed of the most
  recent pages, plus a notice for large files (keep the tab open, scans are recognised page by page).
  Documents longer than the page limit say so up front instead of only in the report.
- Out-of-memory failures and a crashed worker get their own message with concrete suggestions and a
  one-click "Text only" retry; a crashed worker no longer leaves jobs spinning forever.
- Language detection falls back to the time zone (mainland China, Taiwan, Hong Kong, Macau, Japan) when
  no browser language matches, and the page is labelled and titled in the detected language before the
  app loads instead of flashing English first.

### Fixed

- Searchable scans (a full-page image plus an invisible OCR text layer, as scanner software produces)
  came out as pages of giant rotated characters when the PDF stored pages with /Rotate 90/180/270: the
  squashed text boxes of such layers are now read as ordinary lines. The full-page scan image is dropped
  in favour of the text layer, the same as for pages OCR'd by Local PDF, so such books convert in a
  fraction of the time and produce a small, editable document; the report says how many pages this applied to.
- Font sizes of OCR text (Local PDF's own OCR and foreign text layers alike) are estimated from box heights
  and wobble from line to line; they are now snapped to the page's dominant size, so paragraphs are no longer
  split line by line and ordinary lines are no longer promoted to headings. On such pages indentation is
  ignored too (OCR boxes jitter by a character or two) and multi-level numbered short lines ("1.3.1 …")
  still become headings.

### Changed

- The page was re-laid out with room to breathe: a slim top bar and a real headline above the drop
  zone, the four selling points as cards instead of a cramped strip, output format and options grouped
  together with a sliding selector, the three steps side by side, and a highlighted "why local"
  section. Warmer palette with a single accent, a dark theme that keeps its contrast, sections that
  fade in on load, and hover/drag feedback on the drop zone and cards; all motion respects
  `prefers-reduced-motion`.
- Default page limit raised from 500 to 1000.
- Scanned pages whose only text layer is a watermark, header/footer or page number are now recognised
  with OCR instead of being treated as regular pages (a 236-page scanned book used to come out as page
  images plus watermark text).
- Report notes are ordered rarest first, so one important note is not buried under hundreds of repeated
  ones; the job summary shows a badge when the image budget was reached.
- Sections in the main column now have consistent spacing; they used to touch.
- The report now says when the 80 MB image budget was reached instead of dropping images silently.

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

### Also in this release

- GitHub link in the header and footer, version number and "report an issue" link in the footer.
- "Try a sample PDF" in the drop zone (`public/samples/demo.pdf`, generated by `scripts/make-demo-pdf.py`)
  so visitors can see a result without a file of their own; files can also be pasted with Ctrl+V.
- Trust line under the drop zone (nothing uploaded, no sign-up, open source), Open Graph / theme-color meta,
  a noscript notice, and a shimmer on the progress bar during long OCR runs.
- The conversion worker is warmed up while the page is idle, so the first conversion starts without waiting
  for the 2 MB worker bundle.
- SEO: a real content section under the tool (how it works, why local, FAQ) with WebApplication and FAQPage
  JSON-LD in the current language; each interface language has its own URL (`?lang=`) with hreflang
  alternates, a canonical link and a localised meta description; `robots.txt`, `sitemap.xml`, and a static
  English copy of the content in `index.html` for crawlers that do not run JavaScript.
- Visual polish: soft background glow, icon badge in the drop zone, hover/press motion on buttons, entrance
  animation for job cards, a pop on the download button when a job finishes, accordion FAQ; all motion
  respects `prefers-reduced-motion`.
- `wrangler.jsonc` for Cloudflare Workers Git deployments (assets-only Worker serving `dist/`, custom domain bound).


- The ONNX Runtime WASM is no longer shipped with the site; it is loaded from jsDelivr pinned to the exact
  version the OCR SDK was built with (the 26.5 MiB file exceeds Cloudflare Pages' 25 MiB limit).
  `npm run ocr-runtime` copies it into `public/ort/` for hosts that allow it; the app prefers the local copy.
