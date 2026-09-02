# Sample, density, and governance design

## Direction

Keep the existing warm-paper visual language and six-tool structure. This is a density pass, not a redesign: reduce the large vertical gaps between the masthead, tool switcher, title, and working panel; shorten the empty-state drop zone; and tighten lower-page cards just enough that the primary action and its context fit comfortably in the first desktop viewport. Mobile touch targets remain at least 38-40 px, and no content or capability is removed.

Use one neutral English demo PDF for every interface locale. A localized PDF set would quadruple generated binary assets and regression surface without improving the converter itself. The new two-page file still exercises headings, wrapped paragraphs, a list, a ruled table, an embedded raster chart, repeated headers, and page numbers, but uses only built-in Latin fonts and intentionally avoids CJK text. A source-level regression test will open the shipped binary and assert its page count, representative content, and absence of CJK characters.

Real-world validation has two layers. First, inventory the complete user-provided directory and classify every supported file without copying it into the repository. Second, run representative browser conversions across PDF, DOCX, Markdown, PNG, and JPEG, selecting varied sizes and structures. Only aggregate results and non-sensitive technical findings are documented.

Governance stays lightweight: add one canonical `npm run check` quality gate, make CI call it, document test tiers and private-corpus handling, and add a short contributor guide. No new runtime framework, telemetry, upload path, or hosted service is introduced.

## Success criteria

- The shipped demo PDF is readable, entirely English, and visually verified on every page.
- The first desktop viewport contains the tool title and complete primary input panel at common laptop sizes.
- Desktop and mobile layouts have no horizontal overflow and retain accessible controls.
- All supported corpus types receive a real-browser smoke test; failures are investigated and either fixed or explicitly documented.
- One local command matches the CI quality gate, and contribution/testing documentation reflects the actual project.
