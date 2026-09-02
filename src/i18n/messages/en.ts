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

  'output.label': 'Convert to',
  'output.docx': 'Word',
  'output.markdown': 'Markdown',
  'output.both': 'Both',
  'output.docx.hint': 'Creates a .docx with paragraphs, tables, images, headers and footers.',
  'output.markdown.hint':
    'Creates a .md file; zipped together with images when the document has any.',
  'output.both.hint': 'Word and Markdown from the same recognition result.',

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
  'queue.downloadAll': 'Download all ({count})',
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
  'warning.no-text-found': 'No text was found on page {page}',

  'notes.title': 'Good to know',
  'notes.privacy':
    'Files are processed entirely in your browser; nothing is uploaded, and it works offline.',
  'notes.ocr':
    'Scanned pages are recognised automatically; the first time downloads about 17 MB of components, after that nothing more.',
  'notes.report':
    'Open the conversion report when a file finishes; pages with low confidence are worth checking against the original.',
  'notes.limits':
    'Known limits: tables without ruling lines are not detected, formulas and complex graphics become images, fonts are not embedded.',

  'footer.license': 'MIT licence · pdf.js + docx.js + PaddleOCR.js + remark',
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
};
