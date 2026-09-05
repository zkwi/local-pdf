# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.7.0] — 2026-09-05

### Added

- Feedback entry points that open a prefilled GitHub issue form. A failed conversion offers "Report this
  problem" next to Retry, the conversion report ends with "Output looks wrong? Report it", and the crash
  page does the same. The link carries the version, browser, error code, settings and statistics, never
  the file or its name, and everything stays editable on GitHub before submitting.
- Issue templates for bug reports, conversion quality and feature requests, with a reminder not to
  attach private documents. The footer link now lands on the template chooser.
- One static HTML per tool page at build time (`dist/word-to-pdf.html` and friends) with its own title,
  description, canonical, hreflang and Open Graph tags, so crawlers no longer see the home page on every
  URL. The app also keeps description, hreflang and Open Graph tags in sync when switching tools or
  languages.

### Changed

- Page titles put the tool first and the brand last ("Word to PDF in your browser · Local PDF"); Open
  Graph gains locale and image alt tags.
- Unknown paths now answer with a real 404 status on Cloudflare (the app still loads from `404.html`), and
  every response carries `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options` headers.
- The README is English-first with an English screenshot and social card; the Chinese README has its own
  (`docs/screenshot.zh-CN.png`, `docs/social-card.zh-CN.png`). Both link every tool directly and mention
  the in-app feedback buttons.

### Fixed

- Open-ended page ranges no longer expand while typing. Invalid or empty selections now stop with an
  actionable error instead of exporting every page.
- Markdown is cleaned before mounting, and document layout blocks network access. Image decoding,
  font waits and image reads support cancellation and bounded resource waits.
- Long scanned regions keep their images without duplicate OCR text; scan reports flag the layout
  limitations instead of claiming high confidence. Unsupported Word images and supplementary Unicode
  characters now have placeholders and visible warnings.
- Tool navigation wraps on narrow screens when batch counts are present.

## [0.6.0] — 2026-09-02

### Added

- The shared demo PDF is now a polished, language-neutral English document covering paragraphs, lists,
  a ruled table with a merged row, an embedded image, and repeating headers, footers, and page numbers.
  A regression test opens the shipped binary and prevents CJK content or missing sample sections from
  returning unnoticed.
- `npm run check` is the single local and CI quality gate. Contributor and testing guides now document
  architecture boundaries, generated-file checks, browser coverage, and privacy rules for real samples.

### Changed

- Desktop content uses a wider working column and a tighter vertical rhythm. The tool switcher, title,
  primary input panel, and the start of the feature section now fit in a common laptop viewport without
  reducing control sizes.
- Empty drop zones, feature cards, and explanatory sections use more deliberate internal spacing. Mobile
  layouts keep their large action targets and avoid horizontal overflow.
- CI now runs the same canonical quality command contributors use locally, removing duplicated gate
  definitions.

### Fixed

- The old bilingual demo no longer produces stretched CJK glyphs, overlapping table text, or font
  substitution noise when rendered on systems without the expected Chinese display fonts.

## [0.5.0] — 2026-09-02

### Added

- Tool navigation now shows a small count on every tool that has retained jobs or selected images. The
  badge stays visible when switching tools, distinguishes work still in progress, and is included in the
  link's accessible name.
- The inline Markdown editor has a labelled header and can be collapsed without losing the draft. Opening
  it compacts the file picker to leave more room for text; converting collapses it so the result is visible,
  with a clear action to resume editing.

### Changed

- Image reorder, rotate and remove controls use a larger two-by-two touch layout on narrow screens. Batch
  actions and the tool navigation also have larger mobile targets without introducing horizontal overflow.
- File drop zones now use one real native button for file selection, with the sample action as a separate
  sibling control. This removes nested interactive semantics while preserving click, keyboard, paste and
  whole-page drop behaviour.

### Fixed

- Direct links to any of the six tools now keep their tool-specific document title after React mounts.
  The canonical URL also follows client-side tool navigation and the selected language instead of staying
  on the page that first loaded.
- Every mounted tool now has a unique advanced-options panel id, so each “More options” button controls the
  correct panel even after switching between tools.
- Automatic image-quality detection asks the browser for a read-optimised Canvas context, removing repeated
  pixel-read warnings and avoiding an unnecessary GPU readback penalty.

## [0.4.0] — 2026-09-02

### Added

- Files dropped or pasted onto the "wrong" tool page are routed to the right one: a `.docx` dropped on
  PDF → Word switches to Word → PDF and starts converting, images go to Images → PDF, a `.md` together
  with the images it references goes to Markdown → PDF. A toast says which tool was opened.
- "Download all" packs every finished result into one zip (stored, not recompressed) instead of firing
  one download per file, which browsers block after the first few. Duplicate names get " (2)" suffixes.
- PDF → Images takes a page range ("1-3, 5, 8-") under More options; the file names keep the original
  page numbers and the summary lists which pages were rendered.
- Settings under More options (OCR, content, layout details, image format and resolution), the paper /
  font choices for Word / Markdown → PDF and the Images → PDF composer settings are remembered in the
  browser. Stale values from older versions fall back to the defaults.
- PDF → Markdown results have a "Copy Markdown" button next to the download.
- The Markdown editor converts on Ctrl+Enter / ⌘+Enter, and "Insert sample" (also reachable from the drop
  zone) fills it with a document that exercises headings, lists, tasks, a table, code and a quote.
- When a conversion finishes while the tab is in the background, the tab title shows "✅ Done" until you
  come back.
- A "Skip to content" link for keyboard users, an error screen with a reload button instead of a blank
  page if the interface crashes, and the version number in the footer links to this changelog.

### Changed

- Hover lifts and icon tilts are only applied on devices that actually have a pointer that hovers, so
  buttons no longer stick in their hover state after a tap on touch screens.

## [0.3.0] — 2026-09-02

### Added

- Six tool pages with their own URLs and a two-group navigation bar (from PDF / to PDF): PDF → Word (`/`),
  PDF → Markdown, PDF → Images, Word → PDF, Markdown → PDF and Images → PDF. Switching tools keeps queues
  and selected images, deep links and the browser's back button work, and `?lang=` is carried along. The
  former "Both" output is now an "Also create Markdown / Word" switch under More options.
- PDF to images: every page rendered as a PNG or JPEG (96, 150 or 300 DPI, chosen under "More options"),
  zipped when the document has more than one page. Text extraction, OCR and layout analysis are skipped
  entirely in this mode.
- Word → PDF and Markdown → PDF, entirely in the browser: the document is laid out by the browser in a
  hidden frame, paginated with a multi-column trick, and written as a vector PDF with selectable,
  searchable text, clickable links and images at their original resolution. Fonts are not embedded: Latin
  text uses the PDF base fonts (metric-compatible Arial / Times New Roman / Courier New are used for the
  layout), CJK text the reader's built-in CID fonts (Simplified / Traditional Chinese, Japanese, Korean,
  selectable). Word documents keep their page size, margins, headers and footers, tables, images and
  automatic numbering (the CSS counters docx-preview generates are evaluated into real text) and
  PAGE / NUMPAGES fields filled in per page; Markdown
  supports GFM tables, task lists, code blocks, quotes, and images dropped alongside the file or pasted text.
- Images → PDF with a composer: thumbnails in upload order, drag to reorder (move buttons as well),
  rotate, sort by name, page size (fit / A4 / Letter), orientation, margins and an image-quality choice.
  JPEG originals are embedded without re-encoding and EXIF orientation is honoured.

## [0.2.0] — 2026-09-02

### Added

- Ruled tables in scanned pages are recognised: the ruling lines are found in the rendered page image
  (long, thin runs of ink; the skew of a scan is tolerated) and fed to the same table detector as vector
  lines, so a scanned timetable, registration form or three-line table comes out as a Word table instead
  of a jumble of cell texts. Boxes around a single text block and chart grids (many empty cells) are not
  turned into tables.
- Scanned pages of unusual size are normalised: an A4 sheet stored at twice its size (a 15 × 22 inch page
  with 20 pt text, doubling the page count in Word), a phone screenshot 213 pt wide (7 pt text on A4) or a
  full-page web capture 1920 pt wide are scaled so the text is a normal size on an A4-proportioned page.
  The report notes which pages this applied to. OCR renders such oversized pages at a lower scale
  (2600 px wide at most), which roughly halves the recognition time per page.
- Column gutters narrower than two characters are recognised: brokerage reports with a sidebar next to the
  body and two-column papers whose baselines line up across the gutter used to have every line joined
  across the columns ("…非理性因素影响。作为行为 chenshengrui@csc.com.cn"); such lines are now split at the
  gutter and the columns are read in order.
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

- Native documents with a few OCR'd screenshot pages (a Word-generated morning note with pasted charts)
  came out with every paragraph as Heading 1: the OCR pages' font size, snapped to a single value, won the
  document-wide "body size" vote against the native 10.5/11/12 pt text. The body size now comes from
  native text whenever there is enough of it, and OCR pages use their own dominant size as the heading
  threshold, so a 16 pt notice body is no longer a heading just because the attached timetable is 10 pt.
- Footnote markers (a 6 pt superscript "113" at the end of a line) were placed in a paragraph of their own
  and split the paragraph around them; superscripts and subscripts now stay in their line.
- Section names printed sideways in the page margin of a book (a running head) landed in the body text of
  every page; they are now treated as a repeated header (three pages with the same name are enough, since
  the name changes with every chapter).
- Running headers and footers of scanned pages ("请务必阅读正文之后的免责条款和声明") were left in the body
  because their position drifts a few points from page to page and the votes were split between two
  position buckets; repeated lines are now grouped by text first and only need a consistent position.
- "甲方（辅导方）：陆雄杰" followed by "乙方（家长方）：陈红丹" on the next line were joined into one
  paragraph: a short Chinese line is a paragraph end whether or not the next line is indented, in native
  text as in OCR text. A region of only two or three short lines ("时间：…" / "地点：…") uses the page's
  text width to decide which lines are short, so "地点：×××" no longer swallows the next line.
- "一、培训时间" in a scanned notice is a Heading 2 (not a numbered list item) even when the ink density
  does not make it out as bold; a bold value sitting next to a label in the same row ("帐户号码 | 1001…")
  is no longer a heading; 16-digit account numbers are no longer read as section numbers; "•若中考…"
  (a bullet followed directly by Chinese) is a list item.
- Numbered items in Chinese official documents (first line indented two characters, continuation
  lines back at the margin) were split after their first line; they stay together unless the item
  really ended early.
- Page counts inflate less: multi-line paragraphs are written with the measured baseline pitch as an
  exact line height (Word no longer stretches lines to the font's own, taller line height), single-line
  paragraphs borrow the page's body pitch, headings no longer add 12 pt before and 6 pt after on top of
  the measured gap, and a page break is written as "page break before" on the next paragraph instead of
  a separate empty paragraph, which produced a blank page whenever the previous page was exactly full.
  Paragraph spacing is measured as the baseline distance minus the line pitch, so uniform leading
  (a 28 pt-pitch notice) no longer gets 6 pt of extra space after every paragraph.
- Charts with vector grid lines and boxes drawn around a single block of text were turned into tables
  (one brokerage report had 71 one-cell tables around its charts); a box with a single cell is now a
  paragraph.
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
- Scanned Chinese documents come out much closer to the original: the size of a CJK line is now taken
  from its width and character count instead of the box height (boxes with check marks, book-title
  marks or parentheses ran up to 40% taller than their neighbours, which broke paragraphs and lost real
  headings), the body size is unified across pages, bold headings are recognised from ink density on the
  rendered page, red seal fragments and low-confidence specks are dropped instead of becoming 40 pt
  headings, hollow bullets read as a tiny "o" become real bullet items, and a short CJK line ends its
  paragraph even without a full stop ("接口名称：无" no longer glues to the next item).
- A page that is only a full-page image (a scan kept as a picture, a background) no longer pulls the
  section margins down to the paper edge, and images wider than the text area are scaled to fit instead
  of running into the margin.
- Body paragraphs use the measured baseline pitch as a minimum line height instead of a multiple of the
  font's own line height; fonts with tall line heights (Microsoft YaHei) no longer spread a 3-page scan
  over 4 pages.

### Changed

- The page was re-laid out with room to breathe: a slim top bar and a real headline above the drop
  zone, the four selling points as cards instead of a cramped strip, output format and options grouped
  together with a sliding selector, the three steps side by side, and a highlighted "why local"
  section. Warmer palette with a single accent, a dark theme that keeps its contrast, sections that
  fade in on load, and hover/drag feedback on the drop zone and cards; all motion respects
  `prefers-reduced-motion`.
- Everything you operate now lives in one panel on the first screen: the body switches from the drop
  zone to the queue with progress once files are added (with a slim "add more" strip underneath), and
  output format plus "More options" sit in a bar below it, so expanding the options never pushes the
  drop zone down. The queue and settings used to be separate sections further down the page. The dotted background no longer uses a fixed masked layer, which
  could paint garbage during fast scrolling.
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
