# Depth Restructure Implementation Plan

> Executed inline (superpowers:executing-plans). Spec: `docs/superpowers/specs/2026-11-03-portfolio-design.md` §11.

**Goal:** Replace Home list / Works stack / Work / About with Home → Archive|Info → Archive item → Sections.

## Global Constraints
- Main text English; Korean only in Notion body text. Phone hidden. No horizontal scroll at 390px. Media keeps the 1280×720 frame, no upscaling, Instagram originals.
- Old URLs redirect: `/works`→`/archive`, `/works/[slug]`→`/archive/[slug]`, `/about`→`/info`.

## Review Focus
1. Work with no media at all → no empty SECTION, page still renders summary.
2. Work whose first block is a divider or media → no MORE INFO toggle.
3. Old shared links (`/works/ai-generated`) still land on the new page.
4. Archive box without a cover → tinted face with title, no broken img.
5. Keyboard users can open boxes and toggle MORE INFO (real links / `<details>`).

### Task A: `splitSections(blocks)` — `src/lib/sections.ts`
- Produces: `splitSections(blocks: Block[]): { intro: Block[]; sections: { title?: string; blocks: Block[] }[] }`
- Tests `tests/unit/sections.test.ts`: leading text before first media/divider → intro; dividers split sections; empty sections dropped; first heading becomes `title` and is removed from blocks; no media/no divider → one section or none; divider-first → empty intro.

### Task B: Archive + item pages, redirects, nav
- Create `src/pages/archive/index.astro`, `src/pages/archive/[slug].astro`, `src/pages/info.astro`, `src/components/ArchiveBox.astro`, `src/components/Section.astro`; delete works/about pages, WorkStack, work-stack.ts, CategoryList; `astro.config.mjs` `redirects` for old routes (static redirect pages).
- Nav: Home shows bottom-right pills `ARCHIVE` `INFO`; inner pages show top bar `← ARCHIVE`/`JUWON`/`INFO` (`current` marks aria-current).
- e2e: rewrite `works.spec`→`archive.spec`, `work.spec` paths, `about.spec`→`info.spec`, home spec (no category list; ARCHIVE/INFO pills), hero spec (drop hover-reflection test); new tests for Review Focus 1–5 and SECTION labels / MORE INFO toggle / crop-mark frames.
