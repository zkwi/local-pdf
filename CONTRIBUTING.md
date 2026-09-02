# Contributing

Local PDF is deliberately small: it is a static, browser-only application with no upload service. Contributions should solve a current problem with the least new machinery possible.

## Set up

Use Node.js 22 or newer.

```bash
npm install
npm run dev
```

Before opening a pull request, run the same gate as CI:

```bash
npm run check
```

This checks formatting, runs the complete test suite, type-checks, and creates a production build.

## Keep the boundaries intact

- `src/core/` contains conversion logic and must not depend on React.
- `src/ui/` and `src/hooks/` own browser interaction and presentation.
- The worker sends keyed progress, warnings, and errors; localized prose belongs in all four `src/i18n/messages/` tables.
- Do not add an upload path, telemetry, or a network service for user documents.
- Prefer focused functions and existing dependencies over new frameworks or speculative abstractions.

See [Architecture](docs/ARCHITECTURE.md), [Document IR](docs/DOCUMENT_IR.md), and the records in `docs/adr/` before changing a boundary.

## Tests and generated files

Read [Testing](docs/TESTING.md) for the fixture tiers and browser checklist.

- Unit tests live in `tests/` and should cover deterministic layout or conversion behavior directly.
- Generated PDF fixtures keep their source script beside them. PyMuPDF is an authoring tool, not a runtime dependency.
- Regenerate `public/samples/demo.pdf` with `python scripts/make-demo-pdf.py`, then render and inspect every page.
- Never commit private real-world samples, extracted text, screenshots of their contents, or absolute local paths.

## Pull requests

Keep a change narrow, explain the user-visible result, and note what you verified. Include screenshots only when presentation changed, and make sure they contain no private files or account data.
