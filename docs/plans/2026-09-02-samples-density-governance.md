# Sample, Density, and Governance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a language-neutral demo PDF, denser responsive layout, broader real-world validation, and a small maintainable governance upgrade.

**Architecture:** Preserve the existing React and CSS structure, changing only spacing tokens and current component styles. Keep the demo generated from its existing Python source and protect it with a Vitest regression. Treat the private corpus as local test input only and document aggregate evidence without committing source files.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, PyMuPDF, Poppler, Playwright CLI, GitHub Actions, Cloudflare Workers.

---

### Task 1: Protect the demo PDF contract

**Files:**
- Create: `tests/sample-pdf.test.ts`
- Modify: `scripts/make-demo-pdf.py`
- Modify: `public/samples/demo.pdf`

1. Add a test that opens the shipped demo with pdf.js, checks two pages and representative English content, and rejects CJK characters.
2. Run the test against the current bilingual file and confirm it fails.
3. Rewrite the generator as an English-only two-page document using built-in Latin fonts.
4. Regenerate the binary, rerun the test, render both pages, and inspect them for clipping or overlap.

### Task 2: Improve information density

**Files:**
- Modify: `src/styles.css`
- Modify: `docs/screenshot.png`

1. Reduce only outer section gaps, hero spacing, empty drop-zone height, and oversized card padding.
2. Keep action sizes and the responsive breakpoint behavior intact.
3. Verify desktop, mobile, dark mode, keyboard focus, and no horizontal overflow in a real browser.
4. Refresh the repository screenshot from the verified UI.

### Task 3: Establish one quality gate and concise contributor guidance

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `docs/TESTING.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `tests/fixtures/README.md`

1. Add `npm run check` as the canonical format, test, type, and build gate.
2. Use the same command in CI.
3. Document setup, architecture boundaries, generated assets, privacy rules, fixture tiers, and the real-world smoke checklist.
4. Link the new guidance from both READMEs and the fixture guide.

### Task 4: Audit the private real-world corpus

**Files:**
- Create locally only: `tmp/sample-audit/`
- Modify: `docs/TESTING.md` with aggregate results only

1. Inventory every supported file in the provided April directory and profile PDF/DOCX/Markdown/image validity and structure.
2. Select a varied, bounded browser matrix covering all supported input types, text PDFs, image-heavy/scanned PDFs, tables, long documents, and mixed languages.
3. Convert the matrix through the actual UI, inspect outputs and console messages, and investigate any failures.
4. Record counts, coverage, and limitations without committing private filenames or documents.

### Task 5: Release and deploy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`

1. Bump the minor version and describe user-visible changes.
2. Run `npm run check`, `git diff --check`, and a production preview smoke test.
3. Review the exact diff, commit with a concise Simplified Chinese message, and push `main` after fetching the remote.
4. Confirm the connected Cloudflare deployment serves the new version and repeat desktop/mobile production smoke checks.
