# Local PDF

**Convert PDF to Word and Markdown entirely in your browser. Private. Free. Open source.**

Your PDF stays local: parsing, OCR, layout analysis and file generation all run inside the browser.
There is no upload endpoint in the code base at all.

[简体中文](README.zh-CN.md) · Live: <https://localpdfconverter.com>

![Screenshot](docs/screenshot.png)

## Features

| Capability                           | Notes                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------- |
| PDF → Word (.docx)                   | Paragraphs, headings, lists, ruled tables (incl. rules-only tables), images |
| PDF → Markdown                       | Same recognition result; zipped with images and a `manifest.json`           |
| Multi-column reading order           | XY-cut page segmentation, cross-column headings handled                     |
| CJK-aware text joining               | No stray spaces between Chinese characters; hyphenated Latin words rejoined |
| Headers, footers, page numbers       | Detected across pages; page numbers become a Word `PAGE` field              |
| Scanned pages (OCR)                  | PaddleOCR PP-OCRv6, decided per page; native text always wins               |
| Interface languages                  | 简体中文 · 繁體中文 · English · 日本語                                      |
| Password-protected PDFs, batch queue | Progress, cancellation, per-file conversion report                          |

What it deliberately does **not** do: tables with no ruling lines at all (misdetection costs more than it helps),
font embedding, editable formulas, vertical text (flattened with a warning), text colour.
Page counts are not preserved either: every PDF page ends with a page break, so text that overflows after font
substitution spills onto an extra page.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173> and drop a PDF in.

```bash
npm run build       # typecheck + bundle into dist/
npm run preview     # serve dist/ locally
npm test            # unit tests (layout engine, OCR mapping, Markdown, i18n)
npm run ocr-models  # optional: download OCR models into public/ocr-models/ for self-hosting
```

`dist/` is a static site. Put it on any static host (Cloudflare Pages, GitHub Pages, S3, nginx…);
`base` is relative, so subdirectories work. It must be served over **http(s)**; OCR does not start from `file://`.

## OCR

The engine is [PaddleOCR.js](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js)
(official browser SDK, Apache-2.0) with PP-OCRv6, one model covering Chinese, English, Japanese and ~50 other languages.

| Setting            | Model          | First-time download                | Use for                   |
| ------------------ | -------------- | ---------------------------------- | ------------------------- |
| Standard (default) | PP-OCRv6 tiny  | 6 MB model + ~11 MB runtime (gzip) | ordinary scans            |
| High               | PP-OCRv6 small | 31 MB model + ~11 MB runtime       | small print, blurry pages |

- OCR runs only on pages that need it: no text layer, almost no text over a large image, or a garbled text layer.
- Models are downloaded on first use, verified against SHA-256 and kept in Cache Storage; they work offline afterwards.
  The UI shows what is cached and can clear it.
- The ONNX Runtime WASM (26.5 MiB) is loaded from jsDelivr, pinned to the exact version the SDK was built with,
  because it exceeds the 25 MiB single-file limit of Cloudflare Pages and similar hosts.
- To avoid any third-party request, run `npm run ocr-models` (or `npm run ocr-models small` / `all`) and
  `npm run ocr-runtime` before building: the app prefers `public/ocr-models/` and `public/ort/` when present
  (the latter needs a host without the 25 MiB limit).
- Multi-threaded inference needs cross-origin isolation. It is off by default; add
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` to enable it
  (`public/_headers` has the lines commented out). With COEP the models must be self-hosted.

## Deploy

The site is static. On Cloudflare Pages: connect the GitHub repo, build command `npm run build`,
output directory `dist`, Node 22 (read from `.node-version`). `public/_headers` sets cache headers and has the
optional COOP/COEP lines for multi-threaded OCR commented out. Any other static host works the same way.

## Privacy

- No upload code exists. Check the network panel: the only external requests are the optional OCR model and runtime downloads.
- pdf.js CMaps, standard fonts and WASM are self-hosted (copied into `public/` on `npm install`).
- Nothing about the document (name, text, page count) is sent anywhere. There is no analytics.

## Browser support

Chrome / Edge 94+, Firefox 105+, Safari 16.4+. The app checks for Web Workers, WebAssembly (with SIMD) and
OffscreenCanvas on start-up: unsupported browsers get a notice, phones get a "better on a computer" page they can
dismiss, and browsers without WASM SIMD keep working with OCR disabled.

## How it works

```text
PDF ──pdf.js──▶ PrimitiveDocument ──layout engine──▶ LayoutDocument ──▶ SemanticDocument ──┬─▶ docx.js ──▶ .docx
                     ▲                                                                       └─▶ remark  ──▶ .md
        scanned page ─┘ PaddleOCR.js
```

Three intermediate models with strict boundaries; the layout engine is pure functions and is unit-tested
without real PDFs. The core never produces natural language: progress, warnings and errors are keys with
parameters, rendered by the UI in the current language.

```text
src/
├─ core/            # conversion engine, no React dependency
│  ├─ contracts/    # the three intermediate models
│  ├─ pdf/          # pdf.js adapter: text, vector segments, images, rendering
│  ├─ layout/       # lines, columns, paragraphs, tables, headers/footers
│  ├─ semantic/     # layout → document semantics
│  ├─ docx/ markdown/ ocr/ converter/
├─ worker/          # Web Worker and message protocol
├─ i18n/            # locale detection and the four message tables
├─ ui/ hooks/       # React UI, capability detection
scripts/            # asset copying, model download
tests/              # unit tests + PDF fixtures
docs/               # architecture, intermediate model, ADRs (in Chinese)
```

Design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DOCUMENT_IR.md](docs/DOCUMENT_IR.md),
decisions in [docs/adr/](docs/adr/). Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## Development

- TypeScript strict; `npm run typecheck` doubles as the linter. Prettier: `npm run format`.
- Tests: `npm test`. Layout algorithms take hand-built spans, so no PDF is needed.
  The PDF fixtures in `tests/fixtures/` are generated by `make_fixtures.py` (needs PyMuPDF locally; not a project dependency).
- Adding a warning or progress message means adding it to all four tables in `src/i18n/messages/`; the type checker enforces it.
- CI runs format check, typecheck, tests and build on every push.

Issues and pull requests are welcome. Please keep changes small and focused; this is a personal project and
simplicity is a feature.

## License

MIT. Third-party licenses: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
