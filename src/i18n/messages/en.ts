import type { Messages } from './zh-CN.ts';

export const en: Messages = {
  'app.title': 'Local PDF',
  'app.feature': 'PDF to Word / Markdown',
  'app.tagline': 'Your PDF stays local. Everything runs inside your browser, nothing is uploaded.',
  'app.badgeLocal': 'Runs locally',
  'app.badgeLocalTitle': 'There is no upload endpoint at all; works offline too',
  'app.language': 'Language',
  'app.docTitle': 'Local PDF · PDF to Word / Markdown in your browser',

  'drop.title': 'Drop PDF files here, or click to choose',
  'drop.hint': 'Multiple files supported · files never leave this computer',

  'drop.choose': 'Choose PDF files',
  'drop.overlay': 'Drop to start converting',
  'drop.rejected.one': '1 file was skipped because it is not a PDF',
  'drop.rejected.other': '{count} files were skipped because they are not PDFs',

  'summary.pages.one': '1 page',
  'summary.pages.other': '{count} pages',
  'summary.characters.one': '1 character',
  'summary.characters.other': '{count} characters',
  'summary.tables.one': '1 table',
  'summary.tables.other': '{count} tables',
  'summary.images.one': '1 image',
  'summary.images.other': '{count} images',
  'summary.ocrPages.one': 'OCR on 1 page',
  'summary.ocrPages.other': 'OCR on {count} pages',
  'summary.lowConfidence.one': '1 page worth checking',
  'summary.lowConfidence.other': '{count} pages worth checking',
  'app.github': 'GitHub repository',
  'drop.more': 'Add more PDFs: drop them here, or click to choose',
  'drop.paste': 'You can also paste a file with Ctrl+V',
  'drop.sample': 'No file at hand? Try a sample PDF',
  'drop.sampleFailed': 'The sample could not be loaded, please try again later',
  'footer.source': 'Source',
  'footer.issues': 'Report an issue',
  'footer.version': 'Version {version}',
  'footer.builtWith': 'Built with pdf.js · docx.js · PaddleOCR.js · remark',
  'feedback.report': 'Report this problem',
  'feedback.quality': 'Output looks wrong? Report it',
  'feedback.hint':
    'Opens a GitHub issue form prefilled with the version, browser and error details. Your file is not included.',

  'output.label': 'Convert to',
  'output.docx': 'Word',
  'output.markdown': 'Markdown',
  'output.both': 'Both',
  'output.docx.hint': 'Creates a .docx with paragraphs, tables, images, headers and footers.',
  'output.markdown.hint':
    'Creates a .md file; zipped together with images when the document has any.',
  'output.both.hint': 'Word and Markdown from the same recognition result.',
  'output.images': 'Images',
  'output.images.hint':
    'Renders every page as an image, zipped when there is more than one; format, resolution and page range are under "More options".',

  'images.label': 'Image output',
  'images.format.label': 'Format',
  'images.format.png.hint': 'PNG is lossless: the sharpest text and lines, but larger files.',
  'images.format.jpeg.hint':
    'JPEG is compact, good for scans and photos; text edges get slightly soft.',
  'images.dpi.label': 'Resolution',
  'images.dpi.96.hint': 'Enough for viewing on screen; smallest files.',
  'images.dpi.150.hint': 'A balance of sharpness and size; fine for most uses.',
  'images.dpi.300.hint': 'Print quality; large files and slower conversion.',
  'images.size.hint': 'An A4 page comes out at about {width} × {height} pixels.',
  'job.download.image': 'Download image',
  'job.download.image-bundle': 'Download images (zip)',
  'stage.rendering': 'Rendering',
  'progress.rendering': 'Rendering page {page} of {total}',
  'progress.writing-images': 'Packing the images…',

  'nav.label': 'Tools',
  'nav.fromPdf': 'From PDF',
  'nav.toPdf': 'To PDF',
  'nav.word': 'Word',
  'nav.markdown': 'Markdown',
  'nav.images': 'Images',
  'nav.activity.saved': '{tool}, {count} items kept',
  'nav.activity.busy': '{tool}, processing {count} items',
  'tool.docTitle': 'Local PDF · {tool} in your browser',
  'tool.pdf-to-word.title': 'PDF to Word',
  'tool.pdf-to-word.lede':
    'Turn a PDF into an editable .docx: paragraphs, tables, images, headers and footers are rebuilt, scans are recognised automatically.',
  'tool.pdf-to-markdown.title': 'PDF to Markdown',
  'tool.pdf-to-markdown.lede':
    'The same layout analysis, written as .md; images are zipped in along with a manifest.',
  'tool.pdf-to-images.title': 'PDF to Images',
  'tool.pdf-to-images.lede':
    'Every page rendered as a PNG or JPEG at the resolution you choose; multiple pages come as a zip.',
  'tool.word-to-pdf.title': 'Word to PDF',
  'tool.word-to-pdf.lede':
    'The .docx is laid out in your browser and written as a PDF with selectable, searchable text. Nothing is uploaded.',
  'tool.markdown-to-pdf.title': 'Markdown to PDF',
  'tool.markdown-to-pdf.lede':
    'Drop a .md file (together with the images it references), or just paste Markdown text.',
  'tool.images-to-pdf.title': 'Images to PDF',
  'tool.images-to-pdf.lede':
    'Combine images into one PDF in the order you choose: drag thumbnails to reorder, rotate, pick a paper size.',
  'tool.word-to-pdf.hint':
    'Fonts are not embedded, so the file stays small; page size, margins, headers and footers follow the document. Text boxes and WordArt may come out differently.',
  'tool.markdown-to-pdf.hint':
    'Headings, lists, tables, code blocks, task lists, quotes and images are supported; paper and font size are under "More options".',
  'drop.title.word': 'Drop Word documents (.docx) here, or click to choose',
  'drop.title.markdown': 'Drop Markdown files here, or click to choose',
  'drop.title.images': 'Drop images here, or click to choose',
  'drop.hint.markdown': 'Drop the images a .md refers to along with it · or paste text with Ctrl+V',
  'drop.hint.images': 'JPG, PNG, WebP, GIF and more · kept in the order added, drag to rearrange',
  'drop.choose.word': 'Choose Word documents',
  'drop.choose.markdown': 'Choose Markdown files',
  'drop.choose.images': 'Choose images',
  'drop.more.word': 'Add more documents: drop them here, or click to choose',
  'drop.more.markdown': 'Add more files: drop them here, or click to choose',
  'drop.more.images': 'Add more images: drop them here, or click to choose',
  'drop.overlay.images': 'Drop to add the images',
  'drop.unsupported.one': '1 file was skipped because this tool does not take it',
  'drop.unsupported.other': '{count} files were skipped because this tool does not take them',
  'compose.count.one': '1 image selected',
  'compose.count.other': '{count} images selected',
  'compose.dragHint': 'Drag thumbnails to reorder; the order is the page order.',
  'compose.sortByName': 'Sort by name',
  'compose.reverse': 'Reverse',
  'compose.clear': 'Clear',
  'compose.rotate': 'Rotate 90°',
  'compose.moveLeft': 'Move earlier',
  'compose.moveRight': 'Move later',
  'compose.remove': 'Remove',
  'compose.pageSize': 'Page',
  'compose.pageSize.fit': 'Fit image',
  'compose.pageSize.a4': 'A4',
  'compose.pageSize.letter': 'Letter',
  'compose.orientation': 'Orientation',
  'compose.orientation.auto': 'Auto',
  'compose.orientation.portrait': 'Portrait',
  'compose.orientation.landscape': 'Landscape',
  'compose.margin': 'Margins',
  'compose.margin.none': 'None',
  'compose.margin.small': 'Narrow',
  'compose.margin.normal': 'Normal',
  'compose.quality': 'Image quality',
  'compose.quality.auto': 'Auto',
  'compose.quality.lossless': 'As is',
  'compose.quality.compact': 'Compact',
  'compose.quality.auto.hint':
    'Photos as JPEG, screenshots and diagrams lossless; JPEG originals are embedded without re-encoding.',
  'compose.quality.lossless.hint': 'Every image embedded losslessly; the file can get large.',
  'compose.quality.compact.hint':
    'Everything as JPEG, scaled to at most 2000 px; the smallest file.',
  'compose.fileName': 'File name',
  'compose.generate': 'Create PDF',
  'compose.generating': 'Processing image {done} of {total}…',
  'compose.done': 'PDF created: {pages} pages ({size})',
  'compose.download': 'Download PDF',
  'compose.failed': 'Could not create the PDF: {detail}',
  'compose.stale': 'Images or settings changed; create the PDF again.',
  'compose.cancel': 'Cancel',
  'topdf.queued': 'Queued',
  'topdf.stage.render': 'Laying out',
  'topdf.stage.layout': 'Paginating',
  'topdf.stage.images': 'Processing images',
  'topdf.stage.write': 'Writing the PDF',
  'topdf.done': 'Conversion finished',
  'topdf.failed': 'Conversion failed: {detail}',
  'topdf.cancelled': 'Cancelled',
  'topdf.download': 'Download PDF',
  'topdf.imagesSkipped.one': '1 image could not be embedded',
  'topdf.imagesSkipped.other': '{count} images could not be embedded',
  'topdf.unsupportedImages':
    '{formats} images are unsupported; replace them with PNG/JPEG in Word and retry',
  'topdf.charactersReplaced':
    '{count} rare characters or emoji were replaced with □; check against the original',
  'topdf.blockedContent': '{count} external or unsafe items blocked; add images from your device',
  'error.invalid-page-range':
    'The page range is invalid or selects no available pages. Adjust it and retry',
  'warning.scan-image-fallback':
    'Scanned regions on page {page} were kept as images; their text is not editable. Turn off “Keep images” and retry for text',
  'warning.scan-layout-review':
    'Page {page} uses scanned text; charts and layout may not be reconstructed. Check against the original',
  'topdf.pastedName': 'Pasted Markdown',
  'topdf.assetsAdded.one': '1 image kept; it will be used when a .md file is converted',
  'topdf.assetsAdded.other': '{count} images kept; they will be used when a .md file is converted',
  'docpdf.page.label': 'Paper',
  'docpdf.page.a4': 'A4',
  'docpdf.page.letter': 'Letter',
  'docpdf.margin.label': 'Margins',
  'docpdf.margin.narrow': 'Narrow',
  'docpdf.margin.normal': 'Normal',
  'docpdf.margin.wide': 'Wide',
  'docpdf.fontSize.label': 'Body text size',
  'docpdf.cjk.label': 'CJK font',
  'docpdf.cjk.auto': 'Follow interface language',
  'docpdf.cjk.zh-CN': 'Simplified Chinese',
  'docpdf.cjk.zh-TW': 'Traditional Chinese',
  'docpdf.cjk.ja': 'Japanese',
  'docpdf.cjk.ko': 'Korean',
  'docpdf.cjk.hint':
    "Fonts are not embedded: Chinese, Japanese and Korean text is shown with the reader's own fonts, so pick the script to get the right glyph set.",
  'docpdf.word.hint': 'Paper size, margins, headers and footers follow the document.',
  'advanced.also.markdown': 'Also create Markdown',
  'advanced.also.docx': 'Also create Word',
  'seo.how.topdf.1':
    'Drop a Word document, a Markdown file or some images onto the page, or paste them with Ctrl+V.',
  'seo.how.topdf.2':
    'Layout, pagination and PDF writing all happen inside your browser; the file is never sent anywhere.',
  'seo.how.topdf.3':
    'Download the PDF: the text is selectable and searchable, and with no embedded fonts the file stays small.',
  'topdf.error.invalid': 'The file is not a valid Word document (.docx), or it is damaged',
  'topdf.editor.toggle': 'Paste or type Markdown instead',
  'topdf.editor.resume': 'Continue editing your Markdown',
  'topdf.editor.title': 'Markdown content',
  'topdf.editor.collapse': 'Collapse editor',
  'topdf.editor.placeholder': '# Heading\n\nPaste or type Markdown here…',
  'topdf.editor.convert': 'Convert to PDF',
  'topdf.editor.clear': 'Clear',
  'features.vector.title': 'Vector PDF with real text',
  'features.vector.body':
    'Not a page screenshot: the text can be selected, searched and copied, and with no embedded fonts the file stays small.',
  'features.compose.title': 'Arrange, then convert',
  'features.compose.body':
    'Drag images into order, rotate, pick a paper size; Word keeps headers, footers, numbering and tables, Markdown gets tables, code blocks and task lists.',
  'seo.faq.q6': 'Can it turn Word, Markdown and images into PDF?',
  'seo.faq.a6':
    "Yes. Word and Markdown documents are laid out by your browser and written as vector PDFs with selectable text, and images are combined into one PDF in the order you arrange them, all on your computer. Fonts are not embedded (Chinese, Japanese and Korean text is shown with the reader's own fonts), so the files stay small; text boxes and WordArt may come out differently.",

  'advanced.toggle': 'More options',
  'advanced.reset': 'Reset to defaults',

  'ocr.label': 'Scanned pages (OCR)',
  'ocr.auto': 'Automatic',
  'ocr.auto.hint': 'Only pages without a text layer are recognised; regular PDFs are untouched.',
  'ocr.off': 'Off',
  'ocr.off.hint': 'Scanned pages are not recognised and come out blank.',
  'ocr.force': 'Every page',
  'ocr.force.hint':
    'Recognises every page. Much slower; only useful when the text layer is broken.',
  'ocr.quality.label': 'Accuracy',
  'ocr.quality.fast': 'Standard',
  'ocr.quality.balanced': 'High',
  'ocr.quality.fast.hint': 'Small model (about 6 MB), fine for ordinary scans.',
  'ocr.quality.balanced.hint':
    'Larger model (about 30 MB), better for small print or blurry pages.',
  'ocr.language.label': 'Recognition language',
  'ocr.language.auto': 'Follow interface language',
  'ocr.language.zh': 'Simplified Chinese + English',
  'ocr.language.zh-Hant': 'Traditional Chinese + English',
  'ocr.language.en': 'English only',
  'ocr.language.ja': 'Japanese + English',
  'ocr.download.hint':
    'The first scanned page downloads the recognition components (about {size}); they are then kept in the browser and work offline. Download only, never upload.',
  'ocr.japaneseNeedsSmall':
    'Standard accuracy does not cover Japanese; switched to high accuracy automatically.',
  'ocr.cache.status': 'Recognition model stored: {size}',
  'ocr.cache.clear': 'Clear',
  'ocr.unavailable':
    'This browser lacks WebAssembly SIMD, which scanned-page recognition needs. OCR is disabled; regular PDFs still convert.',

  'content.label': 'Content',
  'content.editable': 'Keep layout',
  'content.editable.hint': 'Recognises headings, paragraphs, lists, tables and images.',
  'content.plain': 'Text only',
  'content.plain.hint': 'Plain text in reading order; the safest choice for complex layouts.',

  'layout.label': 'Layout details',
  'layout.columns': 'Detect multiple columns',
  'layout.tables': 'Detect ruled tables',
  'layout.images': 'Keep images',
  'layout.headerFooter': 'Detect headers and footers',
  'layout.keepHeaderFooter': 'Write them as Word headers/footers',

  'queue.title': 'Queue ({count})',
  'queue.downloadAll': 'Download all as zip ({count})',
  'queue.clear': 'Clear list',

  'job.cancel': 'Cancel',
  'job.retry': 'Retry',
  'job.remove': 'Remove',
  'job.download.docx': 'Download Word',
  'job.download.markdown': 'Download Markdown',
  'job.download.markdown-bundle': 'Download Markdown bundle',
  'job.report.show': 'Show conversion report',
  'job.report.hide': 'Hide conversion report',
  'job.password.label': 'This PDF is password protected',
  'job.password.placeholder': 'Enter the password and retry',
  'job.password.submit': 'Unlock and convert',

  'stage.queued': 'Queued',
  'stage.loading': 'Opening PDF',
  'stage.extracting': 'Reading',
  'stage.ocr-model': 'Preparing OCR',
  'stage.ocr': 'Recognising',
  'stage.analyzing': 'Analysing layout',
  'stage.writing': 'Writing',
  'stage.completed': 'Done',
  'stage.failed': 'Failed',
  'stage.cancelled': 'Cancelled',

  'progress.queued': 'Waiting in queue',
  'progress.loading': 'Opening the PDF…',
  'progress.extracting': 'Reading page {page} of {total}',
  'progress.ocr-model-download': 'Preparing recognition model {loaded} / {total}',
  'progress.ocr-model-init': 'Starting the recognition engine',
  'progress.ocr-model-ready': 'Recognition engine ready',
  'progress.ocr': 'Page {page} is a scan, recognising text…',
  'progress.analyzing': 'Analysing the layout…',
  'progress.writing-docx': 'Writing the Word file…',
  'progress.writing-markdown': 'Writing Markdown…',
  'progress.completed': 'Conversion finished',
  'progress.failed': 'Conversion failed',
  'progress.cancelled': 'Cancelled',

  'error.cancelled': 'Conversion cancelled',
  'error.password-required': 'This PDF needs a password to open',
  'error.password-incorrect': 'Wrong password',
  'error.invalid-pdf': 'Not a valid PDF, or the file is damaged',
  'error.unknown': 'Conversion failed: {detail}',
  'error.read-file': 'Could not read the file',

  'report.pages': 'Pages',
  'report.characters': 'Characters',
  'report.tables': 'Tables',
  'report.images': 'Images',
  'report.ocrPages': 'OCR pages',
  'report.ocrEngine': 'OCR engine',
  'report.duration': 'Time',
  'report.warnings': '{count} notes worth checking',
  'report.more': '… {count} more omitted',
  'report.pageDetails': 'Per-page details',
  'report.col.page': 'Page',
  'report.col.confidence': 'Confidence',
  'report.col.columns': 'Columns',
  'report.col.paragraphs': 'Paragraphs',
  'report.col.headings': 'Headings',
  'report.col.lists': 'Lists',
  'report.col.tables': 'Tables',
  'report.col.images': 'Images',
  'report.col.characters': 'Characters',

  'warning.encrypted-pdf': 'The file is encrypted',
  'warning.page-extract-failed': 'Page {page} could not be parsed and was skipped: {reason}',
  'warning.page-render-failed':
    'Page {page} could not be rendered; images and OCR are unavailable: {reason}',
  'warning.page-render-downscaled':
    'Page {page} is very large; render scale reduced from {from}× to {to}×',
  'warning.image-extract-failed': 'An image on page {page} could not be extracted: {reason}',
  'warning.operator-list-failed':
    'Vector data on page {page} could not be read; tables and images may be missing: {reason}',
  'warning.low-confidence-reading-order':
    'Column detection on page {page} is uncertain ({columns} columns); please check the reading order',
  'warning.low-confidence-table':
    'A table on page {page} has incomplete rules ({percent}% complete); rows and columns may be off',
  'warning.table-dropped': 'A low-confidence table on page {page} was not written',
  'warning.ocr-applied': 'Text on page {page} comes from OCR and may contain recognition errors',
  'warning.ocr-failed': 'OCR failed on page {page}: {reason}',
  'warning.ocr-skipped': 'Page {page} needed OCR but could not be rendered; skipped',
  'warning.ocr-sparse-kept-image':
    'Only {count} characters were recognised on page {page}; treated as a figure and kept as an image',
  'warning.ocr-model-unverified':
    'Model {model} does not match the built-in checksum (upstream may have updated it); used anyway',
  'warning.markdown-table-html':
    'A table with merged cells cannot be expressed in Markdown; embedded as an HTML table instead',
  'warning.rotated-text-flattened':
    'Page {page} has {count} rotated text runs; written as ordinary paragraphs',
  'warning.vertical-text-flattened': 'Page {page} has vertical text; written horizontally',
  'warning.font-substituted': 'Font {from} replaced with {to}',
  'warning.page-limit-exceeded':
    'The document has {total} pages; only the first {limit} were converted',
  'warning.page-size-clamped':
    'Page {page} exceeds the Word page-size limit (a tall image); laid out on A4 pages instead',
  'warning.scan-page-resized':
    'Page {page} is a scan of unusual size (an oversized scan or a phone screenshot); scaled to A4 proportions so the text is a normal size',
  'warning.no-text-found': 'No text was found on page {page}',

  'meta.description':
    'Local PDF converts PDF to Word, Markdown and images, and Word, Markdown and images to PDF, entirely in your browser. Nothing is uploaded, free and open source, with automatic OCR for scanned pages in Chinese, English, Japanese and more.',
  'seo.how.title': 'How it works',
  'seo.how.1': 'Drop a PDF onto the page, paste it with Ctrl+V, or try the sample file first.',
  'seo.how.2':
    'Text extraction, layout analysis and OCR for scanned pages all run inside your browser; the file is never sent anywhere.',
  'seo.how.3':
    'Download Word or Markdown, and open the conversion report to see which pages deserve a second look.',
  'seo.why.title': 'Why convert locally',
  'seo.why.body':
    'Most online converters upload your file to a server. Local PDF has no server: it is a static page, the conversion engine runs in your browser, and you can verify that in the network panel. Contracts, statements and papers never leave your computer.',
  'seo.faq.title': 'Frequently asked questions',
  'seo.faq.q1': 'Is it really free?',
  'seo.faq.a1':
    'Yes. It is open source under the MIT licence, needs no account, and has no limit on the number or size of files beyond the memory of your computer.',
  'seo.faq.q2': 'Does it upload my file?',
  'seo.faq.a2':
    'No. There is no server to upload to, and the page keeps working offline once loaded. Only the OCR components are downloaded the first time a scanned page needs them.',
  'seo.faq.q3': 'Can it convert scanned PDFs?',
  'seo.faq.a3':
    'Yes. Pages without a text layer are recognised with PaddleOCR inside your browser, covering Simplified and Traditional Chinese, English, Japanese and more than 50 other languages.',
  'seo.faq.q4': 'How faithful is the Word output?',
  'seo.faq.a4':
    'Text from PDFs with a text layer is exact; paragraphs, headings, lists, ruled tables, images and headers/footers are rebuilt. Fonts are not embedded, so line breaks can shift; the report flags pages with low confidence.',
  'seo.faq.q5': 'Which browsers are supported?',
  'seo.faq.a5':
    'Recent Chrome, Edge, Firefox and Safari 16.4 or later on a computer. Phones handle small files, but large scans can run out of memory.',

  'footer.license': 'MIT licence',
  'footer.hint': 'Recognition is never perfect; check important documents.',

  'compat.unsupported.title': 'This browser cannot run the converter',
  'compat.unsupported.body':
    'Conversion needs Web Workers, WebAssembly and OffscreenCanvas, and this browser is missing one of them. Please use a recent Chrome, Edge, Firefox or Safari (16.4 or later).',
  'compat.mobile.title': 'Best used on a computer',
  'compat.mobile.body':
    'Mobile browsers have limited memory and WebAssembly support, so large files and scanned documents often fail or get killed by the system. Open this link on a computer for a much better experience.',
  'compat.mobile.copy': 'Copy link',
  'compat.mobile.copied': 'Copied',
  'compat.mobile.continue': 'Try on this phone anyway (small files only)',
  'compat.lowMemory':
    'This device has little memory; large files may fail. Convert one file at a time.',

  'features.label': 'Why Local PDF',
  'features.local.title': 'Files never leave your computer',
  'features.local.body':
    'There is no server: parsing, recognition and file generation all run in your browser, even offline.',
  'features.editable.title': 'Real, editable Word',
  'features.editable.body':
    'Paragraphs, headings, lists, tables, images and headers/footers are rebuilt, not pasted in as page screenshots.',
  'features.ocr.title': 'Scans recognised automatically',
  'features.ocr.body':
    'Pages without a text layer go through OCR, covering Chinese, English, Japanese and 50+ other languages.',
  'features.free.title': 'Free and open source',
  'features.free.body': 'MIT licence. No account, no limits, no watermark.',

  'job.elapsed': 'Elapsed {time}',
  'job.duration': 'Took {time}',
  'job.eta.underMinute': 'Under a minute left',
  'job.eta.minutes': 'About {count} min left',
  'job.eta.hours': 'About {hours} h {minutes} min left',
  'job.large.size':
    'Large file ({size}): this will take a while. Keep this page open; you can switch tabs and watch the progress in the title bar.',
  'job.large.pages':
    'This file has {pages} pages ({size}): this will take a while. Keep this page open; you can switch tabs and watch the progress in the title bar.',
  'job.large.ocr':
    'This is a scan, so every page is recognised one by one, which is much slower than a regular PDF; speed depends on your computer.',
  'job.pageLimit': 'The document has {total} pages; only the first {limit} are converted.',
  'job.retryPlain': 'Retry with "Text only"',

  'error.out-of-memory': 'The browser ran out of memory and the conversion stopped',
  'error.worker-crashed': 'The conversion process quit unexpectedly, most likely out of memory',
  'error.memory.hint':
    'Things to try: close other tabs and retry; switch to "Text only" so images are not kept; or split the PDF into parts and convert them separately.',
  'warning.image-budget-exceeded':
    'Images reached the {limit} limit; none are kept from page {page} onwards',
  'summary.imageBudget': 'Images over the {limit} limit; none kept from page {page}',
  'warning.scan-text-layer':
    '{count} pages are scans with their own text layer; the text was used and the full-page scan images were not kept',

  'app.skip': 'Skip to content',
  'app.titleDone': '✅ Done',
  'drop.switched': 'Switched to {tool}',
  'drop.sample.markdown': 'No file at hand? Fill in a Markdown sample',
  'queue.zipping': 'Packing…',
  'queue.zipFailed': 'Could not pack the files; please download them one by one',
  'job.copy': 'Copy Markdown',
  'job.copied': 'Copied to the clipboard',
  'job.copyFailed': 'Could not copy; please download the file instead',
  'topdf.editor.sample': 'Insert sample',
  'topdf.editor.sampleText':
    '# Sample document\n\nThis is a bit of **Markdown**; in the PDF the text stays selectable and searchable.\n\n## Lists\n\n- A bullet\n- Another one\n  1. A nested numbered step\n  2. The second step\n\n## Tasks\n\n- [x] Done\n- [ ] To do\n\n## Table\n\n| Item | Qty | Note |\n| --- | ---: | --- |\n| Apples | 3 | red |\n| Oranges | 12 | sweet |\n\n## Code\n\n```js\nconsole.log("Hello, Local PDF");\n```\n\n> Quote: the file never leaves your computer.\n\n[Learn more](https://localpdfconverter.com)\n',
  'images.range.label': 'Page range',
  'images.range.placeholder': 'All pages',
  'images.range.hint':
    'Leave empty for every page. For example 1-3, 5, 8- means pages 1 to 3, page 5, and page 8 to the end.',
  'images.range.invalid': 'Invalid page range. Write it like 1-3, 5, 8- before converting.',
  'summary.pageRange': 'Pages {range}',
};
