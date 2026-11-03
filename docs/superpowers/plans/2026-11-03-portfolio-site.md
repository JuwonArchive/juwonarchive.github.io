# JUWON Portfolio Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static portfolio site for JUWON (3D · AI · graphic designer) that rebuilds itself hourly from the Notion page "JUWON's ARCHIVES" and deploys to GitHub Pages.

**Architecture:** A sync script reads Notion through the official API, converts it with a pure mapping module into one `src/data/site.json` file and downloads media into `public/media/`. Astro builds four pages from `site.json` only. A GitHub Actions workflow runs sync → build → smoke test → deploy, and skips the build when the Notion content hash matches the deployed one.

**Tech Stack:** Node 22, Astro 7, TypeScript, Three.js 0.187, @notionhq/client 5, sharp, Vitest 5, @playwright/test **1.63.0** (matches the preinstalled Chromium), fonts via @fontsource-variable/archivo, @fontsource-variable/geist-mono, pretendard.

**Spec:** `docs/superpowers/specs/2026-11-03-portfolio-design.md`

## Global Constraints

- Every heading, nav label, button and section title is English uppercase. Korean appears only in Notion-sourced body text and in experience item labels.
- Home headline is exactly `JUWON`; subline exactly `3D · AI · GRAPHIC DESIGNER — BASED IN ILSAN, KOREA`.
- `<title>` and `og:title` on Home: `JUWON — 3D · AI · Graphic Designer`. Other pages: `<PAGE> — JUWON` (e.g. `WORKS — JUWON`).
- Phone number is never rendered unless `src/config.ts` has `showPhone: true` (default `false`).
- Colors: bg `#F7F7F5`, lavender `#E6E4F2`, mint `#E3EEE8`, ink `#111111`, muted `#6B6B6B`. Pill buttons: white bg, 1px `#DDDDDD` border, active = `#111` bg / white text.
- Fonts are bundled from npm; no external font requests.
- Images: resized to max 2400px long edge, WebP. Videos copied as-is. Any single file > 95 MB (99,614,720 bytes) is not deployed; it becomes a `fallback-link` block.
- `prefers-reduced-motion: reduce` disables the 3D rotation and card animations.
- No horizontal page scroll at 390px width.
- Notion token only ever comes from env `NOTION_TOKEN`; root page id from env `NOTION_ROOT_PAGE_ID` (default `f30132cd-b7b4-4237-a40b-905086f79d6f`).
- Generated files are gitignored: `src/data/site.json`, `public/media/`.

## Review Focus

1. **Duplicate English titles** (two rows both titled "3D") → slugs must stay unique: `3d`, `3d-2`. Test in Task 3.
2. **Project row with no cover image** → card and home preview still render (pastel block with the English title), no broken `<img>`. Tests in Task 3 (cover is `undefined`) and Task 8 (e2e: no `img` with empty src).
3. **Experience line without a period** ("포트폴리오 준비중") → kept, sorted last, rendered without a date column. Test in Task 3.
4. **Videos on iPhone** → `<video>` must carry `muted`, `playsinline`, `loop`, `autoplay`, `controls` or iOS will not autoplay. e2e assertion in Task 9.
5. **Notion signed file URLs change on every fetch** → content hash must ignore URL query strings, or the hourly job redeploys forever. Test in Task 4.

---

## File Structure

```
DESIGN.md                         design tokens & rules (awesome-design-md format)
src/config.ts                     site constants (showPhone, category name map, copy)
src/lib/site-schema.ts            SiteData types shared by sync + site
src/lib/notion/types.ts           NotionSnapshot (raw input shape for map.ts)
src/lib/notion/richtext.ts        Notion rich_text → RichText
src/lib/notion/blocks.ts          Notion block tree → Block[] (+ embed provider)
src/lib/notion/map.ts             NotionSnapshot → SiteData (contact, experience, skills, works)
src/lib/notion/hash.ts            stable content hash
src/lib/notion/fetch.ts           official API → NotionSnapshot (network only)
src/lib/notion/media.ts           download/convert media, rewrite src
scripts/sync-notion.ts            CLI: fetch → map → media → write site.json + public/sync-hash.txt
src/data/load.ts                  reads site.json, clear error if missing
src/styles/global.css             tokens, fonts, base
src/layouts/Base.astro            html shell, meta, nav, footer
src/components/Nav.astro, Footer.astro, Pill.astro
src/components/CategoryList.astro, ChromeHero.astro, WorkStack.astro, BlockRenderer.astro, RichText.astro
src/scripts/chrome-hero.ts        Three.js scene
src/scripts/work-stack.ts         stacked-card interaction
src/pages/index.astro, works/index.astro, works/[slug].astro, about.astro
tests/unit/*.test.ts              Vitest
tests/fixtures/snapshot.json      NotionSnapshot fixture (official API shapes)
tests/e2e/*.spec.ts               Playwright
.github/workflows/deploy.yml
docs/SETUP.ko.md                  user setup guide (Korean)
```

## Shared Interfaces (defined in Task 1, used everywhere)

```ts
// src/lib/site-schema.ts
export type RichText = { text: string; href?: string; bold?: boolean; italic?: boolean; code?: boolean }[];
export type Media = { id: string; src: string; kind: 'image' | 'video'; width?: number; height?: number; bytes?: number };
export type EmbedProvider = 'youtube' | 'vimeo' | 'instagram' | 'other';
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: RichText }
  | { type: 'paragraph'; text: RichText }
  | { type: 'list'; ordered: boolean; items: RichText[] }
  | { type: 'quote'; text: RichText }
  | { type: 'divider' }
  | { type: 'image'; media: Media; caption?: RichText }
  | { type: 'video'; media: Media; caption?: RichText }
  | { type: 'embed'; url: string; embedUrl: string; provider: EmbedProvider; caption?: RichText }
  | { type: 'fallback-link'; url: string; label: string };
export type Work = { slug: string; titleEn: string; titleKo: string; tags: string[]; cover?: Media; link?: string; blocks: Block[] };
export type ExperienceItem = { label: string; period?: string; sortKey: number };
export type SiteData = {
  generatedAt: string;               // ISO
  contact: { email?: string; instagram?: { handle: string; url: string }; location?: string; phone?: string };
  experience: ExperienceItem[];      // newest first
  skills: { software: string[]; expertise: string[]; language: string[] };
  works: Work[];                     // Notion row order
};
export type Warning = { code: string; message: string };
```

---

### Task 1: Project scaffold, design tokens, DESIGN.md

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/config.ts`, `src/lib/site-schema.ts`, `src/styles/global.css`, `src/layouts/Base.astro`, `src/pages/index.astro` (placeholder), `DESIGN.md`
- Test: `tests/unit/config.test.ts`

**Interfaces:**
- Produces: types in "Shared Interfaces"; `src/config.ts`:
  ```ts
  export const config: {
    showPhone: boolean;                                  // false
    categoryNames: Record<string, string>;               // {'3D 디자인':'3D DESIGN','AI 생성':'AI GENERATED','2D':'2D GRAPHIC','TouchDesigner':'TOUCHDESIGNER'}
    headline: string;                                    // 'JUWON'
    subline: string;                                     // '3D · AI · GRAPHIC DESIGNER — BASED IN ILSAN, KOREA'
    homeTitle: string;                                   // 'JUWON — 3D · AI · Graphic Designer'
    pastels: string[];                                   // ['#E6E4F2','#E3EEE8','#F2E6E4','#E4ECF2'] cycled per work index
  };
  ```
  `Base.astro` props: `{ title: string; description?: string; bg?: string }`.
- npm scripts: `dev`, `build` (`astro build`), `preview`, `test` (`vitest run`), `e2e` (`playwright test`), `sync` (`tsx scripts/sync-notion.ts`), `check` (`astro check`).

- [ ] **Step 1:** `npm create astro@latest` equivalent by hand (empty template, strict TS). Install deps: `astro@^7 three@^0.187 @types/three sharp @notionhq/client@^5 @fontsource-variable/archivo @fontsource-variable/geist-mono pretendard` and dev deps `vitest@^5 @playwright/test@1.63.0 tsx @astrojs/check typescript`. `.gitignore`: `node_modules dist .astro src/data/site.json public/media public/sync-hash.txt test-results playwright-report`.
- [ ] **Step 2: Write the failing test** `tests/unit/config.test.ts`: asserts `config.showPhone === false`, `config.headline === 'JUWON'`, `config.subline === '3D · AI · GRAPHIC DESIGNER — BASED IN ILSAN, KOREA'`, `config.categoryNames['AI 생성'] === 'AI GENERATED'`.
- [ ] **Step 3:** Run `npm test` → FAIL (module missing).
- [ ] **Step 4:** Write `src/config.ts`, `src/lib/site-schema.ts`, `global.css` (CSS custom properties for every Global Constraints color; `--font-display: 'Archivo Variable'` with `font-stretch: 125%; font-weight: 900`, `--font-body: 'Pretendard Variable'`, `--font-mono: 'Geist Mono Variable'`; body `word-break: keep-all; overflow-wrap: anywhere` for Korean; `.pill` class), `Base.astro` (imports fonts: `@fontsource-variable/archivo/wdth.css`, `@fontsource-variable/geist-mono`, `pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css`; sets `<title>`, `og:title`, `og:description`, `lang="ko"`).
- [ ] **Step 5:** Write `DESIGN.md` in the awesome-design-md format (YAML front matter: `name`, `description`, `colors`, `typography`, `radius`, `spacing`; then sections: Visual Theme, Color Roles, Typography Rules, Components (pill button, card, nav), Layout, Motion, Do/Don't). Values = Global Constraints + spec §2.
- [ ] **Step 6:** Run `npm test` → PASS; `npm run build` → completes, `dist/index.html` exists.
- [ ] **Step 7: Commit** `feat: scaffold Astro site with design tokens and DESIGN.md`

---

### Task 2: Notion blocks → Block[]

**Files:**
- Create: `src/lib/notion/types.ts`, `src/lib/notion/richtext.ts`, `src/lib/notion/blocks.ts`
- Test: `tests/unit/blocks.test.ts`

**Interfaces:**
- Consumes: `Block`, `RichText`, `Media`, `Warning` (Task 1).
- Produces:
  ```ts
  // types.ts — raw official-API objects, children attached
  export type NBlock = { id: string; type: string; [k: string]: any; children?: NBlock[] };
  export type NPage  = { id: string; properties: Record<string, any>; blocks: NBlock[] };
  export type NotionSnapshot = { rootBlocks: NBlock[]; projects: NPage[]; skills: NPage[] };
  // richtext.ts
  export function toRichText(rt: any[] | undefined): RichText;
  export function plain(rt: RichText): string;
  // blocks.ts
  export function toBlocks(nodes: NBlock[], warn: (w: Warning) => void): Block[];
  export function toEmbed(url: string): { provider: EmbedProvider; embedUrl: string };
  ```

- [ ] **Step 1: Write failing tests** in `tests/unit/blocks.test.ts`:
  - `toRichText` keeps `href` from `text.link.url` and `annotations.bold`.
  - `heading_1/2/3` → `{type:'heading', level}`; `sub_sub_header`-equivalent `heading_3` → level 3.
  - Consecutive `bulleted_list_item`s merge into one `{type:'list', ordered:false, items:[…3]}`; `numbered_list_item` → `ordered:true`.
  - `image` with `file.url` → `{type:'image', media:{id:<block id>, src:<url>, kind:'image'}}`; `external.url` handled the same.
  - `video` with `external.url = 'https://www.youtube.com/watch?v=abc123'` → `{type:'embed', provider:'youtube', embedUrl:'https://www.youtube.com/embed/abc123'}`; `video` with `file.url` → `{type:'video'}`.
  - `toEmbed('https://youtu.be/abc123').embedUrl === 'https://www.youtube.com/embed/abc123'`; `toEmbed('https://vimeo.com/76979871').embedUrl === 'https://player.vimeo.com/video/76979871'`; `toEmbed('https://www.instagram.com/p/XYZ/').embedUrl === 'https://www.instagram.com/p/XYZ/embed'`; unknown → `{provider:'other', embedUrl:url}`.
  - `column_list`/`column`/`synced_block` are transparent: their children are flattened into the output in order.
  - Unknown type `'table_of_contents'` → skipped, `warn` called once with `code:'unknown-block'`.
  - Empty paragraph (no text) → skipped (Notion uses them as spacers).
- [ ] **Step 2:** `npx vitest run tests/unit/blocks.test.ts` → FAIL.
- [ ] **Step 3:** Implement the three files. Media `id` = Notion block id. `embed`, `bookmark` and external `video` blocks go through `toEmbed`. `caption` from the block's `caption` rich text when non-empty.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: map Notion blocks to site blocks`

---

### Task 3: NotionSnapshot → SiteData

**Files:**
- Create: `src/lib/notion/map.ts`, `tests/fixtures/snapshot.json`
- Test: `tests/unit/map.test.ts`

**Interfaces:**
- Consumes: `toBlocks`, `toRichText`, `plain` (Task 2), `config` (Task 1).
- Produces:
  ```ts
  export function mapSnapshot(s: NotionSnapshot, opts: { showPhone: boolean; now: Date }): { site: SiteData; warnings: Warning[] };
  export function englishTitle(titleKo: string, override: string | undefined, index: number): { title: string; warned: boolean };
  export function slugify(title: string, taken: Set<string>): string;
  export function parseExperience(line: string): ExperienceItem;
  ```
- Notion facts (from the live page): root has `column_list` → first `column` holds `heading_1 "Contact"` followed by `child_page` blocks titled `010-0000-0000`, `ILSAN, Korea`, `juwon0824@naver.com`, `@baboyeonggaam`, a `divider`, then `heading_1 "Education & Employment"` and `bulleted_list_item`s. Projects rows have properties `이름` (title), `태그` (multi_select), `커버` (files), `관련 링크` (url), and new `영문 제목` (rich_text, may be absent). Skills rows have `Name` (title), `Type` (select: `Software` | `Expertise` | `Language`).

- [ ] **Step 1: Build fixture** `tests/fixtures/snapshot.json` in official API shapes reproducing the facts above: 4 project rows (`3D 디자인`, `AI 생성`, `2D`, `TouchDesigner`; `TouchDesigner` has no cover), each with 2–3 blocks; skills rows: Daz 3d, Cinema4D, Adobe Photoshop (Software), Team Management (Expertise), Korean, English (Language); experience lines exactly as on Notion: `강동고등학교 2016~2019`, `장안대학교 멀티미디어컨텐츠과 2019~2024`, `GEMSHO 인턴 24.09~24.11`, `KNOWCK 일경험인턴 26.01 ~ 26.02`, `MSHN 3D 디자이너 26.03~26.05`, `WNT Studio 그래픽 디자이너 26.09~`.
- [ ] **Step 2: Write failing tests** `tests/unit/map.test.ts`:
  - contact: `email === 'juwon0824@naver.com'`, `instagram` `{handle:'@baboyeonggaam', url:'https://www.instagram.com/baboyeonggaam/'}`, `location === 'ILSAN, Korea'`, `phone === undefined` with `showPhone:false`, `phone === '010-0000-0000'` with `showPhone:true`.
  - experience: first item label `WNT Studio 그래픽 디자이너`, period `26.09~`; last item `강동고등학교`; `parseExperience('포트폴리오 준비중')` → `{label:'포트폴리오 준비중', period: undefined, sortKey: -Infinity}` and it sorts last. Period regex: trailing `(\d{2}|\d{4})(\.\d{2})?\s*~\s*((\d{2}|\d{4})(\.\d{2})?)?$`; two-digit years → 20YY; sortKey = year*100 + month(0 if absent).
  - skills: `software` contains `Cinema4D`, `expertise` = `['Team Management']`, `language` = `['Korean','English']` (row order kept).
  - works: titles `['3D DESIGN','AI GENERATED','2D GRAPHIC','TOUCHDESIGNER']`, slugs `['3d-design','ai-generated','2d-graphic','touchdesigner']`; `영문 제목` override `'Motion Works'` → title `'MOTION WORKS'`; TouchDesigner work has `cover === undefined`.
  - `englishTitle('새 작업', undefined, 4)` → `{title:'UNTITLED 05', warned:true}`; `englishTitle('Blender 실험', undefined, 0)` → `{title:'BLENDER', warned:false}` (keep ASCII letters/digits/spaces, trim, collapse spaces).
  - duplicates: two rows titled `3D` → slugs `3d`, `3d-2`.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement `map.ts`. Contact classification per child_page title: email regex → email; `/^0\d{1,2}-\d{3,4}-\d{4}$/` → phone; starts with `@` → instagram; else location. Locate sections by heading text (`/contact/i`, `/education|employment/i`), not by position. `generatedAt = opts.now.toISOString()`.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6: Commit** `feat: map Notion snapshot to site data`

---

### Task 4: Fetch, media, hash, sync CLI

**Files:**
- Create: `src/lib/notion/fetch.ts`, `src/lib/notion/media.ts`, `src/lib/notion/hash.ts`, `scripts/sync-notion.ts`, `src/data/load.ts`
- Test: `tests/unit/hash.test.ts`, `tests/unit/media.test.ts`

**Interfaces:**
- Consumes: `NotionSnapshot`, `mapSnapshot` (Task 3).
- Produces:
  ```ts
  // fetch.ts
  export async function fetchSnapshot(token: string, rootPageId: string): Promise<NotionSnapshot>;
  // hash.ts
  export function snapshotHash(s: NotionSnapshot): string;           // sha256 hex
  // media.ts
  export const MAX_BYTES = 99_614_720;
  export function mediaPath(m: Media, ext: string): string;          // '/media/<id>.<ext>'
  export async function localizeMedia(site: SiteData, outDir: string, warn: (w: Warning) => void,
    io?: { download(url: string): Promise<Buffer>; toWebp(buf: Buffer): Promise<{ buf: Buffer; width: number; height: number }> }): Promise<SiteData>;
  // load.ts
  export function loadSite(): SiteData;   // throws Error('src/data/site.json not found — run `npm run sync` first')
  ```
- CLI: `npm run sync` → writes `src/data/site.json`, `public/media/*`, `public/sync-hash.txt`; prints warnings. `npm run sync -- --check <deployedHashUrl>` → only fetches + hashes; prints `changed=true|false` and appends it to `$GITHUB_OUTPUT` when set; a failed/404 fetch of the deployed hash counts as `changed=true`.

- [ ] **Step 1: Write failing tests**
  - `hash.test.ts`: two snapshots identical except file URL query strings (`?X-Amz-Signature=aaa` vs `bbb`) → equal hash; changing a paragraph's text → different hash.
  - `media.test.ts` (inject fake `io`): image → `src` becomes `/media/<id>.webp` with width/height set, file written; video with 1,000 bytes → `/media/<id>.mp4`; video with `MAX_BYTES + 1` bytes → block replaced by `{type:'fallback-link', label:'VIEW ON NOTION'}` and one warning `code:'media-too-large'`; download throws → block removed, warning `code:'media-failed'`; work `cover` localized too; `mediaPath` deterministic.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `fetch.ts` uses `@notionhq/client` v5: `blocks.children.list` (paginate, recurse into `has_children`, but do not descend into `child_page`/`child_database`); for each `child_database` call `databases.retrieve` → `data_sources[0].id` → `dataSources.query` (paginate) → for project rows also fetch page blocks. Identify Projects DB as the one whose schema has a `files` property; Skills DB as the one with a `Type` select. Rate-limit: sequential requests. `hash.ts`: JSON-stringify with sorted keys after replacing every string that is an `http(s)` URL with the URL minus its query string. Video extension from URL path (default `mp4`).
- [ ] **Step 4:** Run → PASS. Also `NOTION_TOKEN= npm run sync` → exits non-zero with message `NOTION_TOKEN is not set`.
- [ ] **Step 5: Commit** `feat: Notion sync CLI with media localization and content hash`

---

### Task 5: Local preview data (not committed)

Real sync needs the user's token, which arrives later. To build pages against real content now:

- [ ] **Step 1:** In the scratchpad (outside the repo), write a one-off converter that reads the public-API snapshot already fetched (`scratchpad/notion/*.json`), downloads media through `https://www.notion.so/image/<encoded url>?table=block&id=<id>`, and writes `src/data/site.json` + `public/media/` in the `SiteData` shape.
- [ ] **Step 2:** Verify: `node -e "const s=require('./src/data/site.json');console.log(s.works.map(w=>w.titleEn), s.experience[0].label)"` prints the 4 English titles and `WNT Studio 그래픽 디자이너`. `git status` shows neither file (gitignored). Nothing to commit.

---

### Task 6: Layout, nav, footer, Home (without 3D)

**Files:**
- Create: `src/components/Nav.astro`, `Footer.astro`, `Pill.astro`, `CategoryList.astro`; Modify: `src/pages/index.astro`, `src/layouts/Base.astro`; Create: `playwright.config.ts`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `loadSite()` (Task 4), `config` (Task 1).
- Produces: `CategoryList` renders `<a data-category-item data-cover="<cover src or ''>" data-bg="<pastel>" href="/works/<slug>">` per work — Task 7 listens to these. Home has `<div id="hero-slot">` where Task 7 mounts the canvas.
- Playwright: `webServer` = `npm run build && npm run preview -- --port 4321`; projects `desktop` (1440×900) and `mobile` (390×844, isMobile).

- [ ] **Step 1: Write failing e2e** `home.spec.ts` (both projects):
  - `h1` text is `JUWON`; subline text equals `config.subline`; `document.title === 'JUWON — 3D · AI · Graphic Designer'`.
  - nav has links `WORKS` → `/works`, `ABOUT` → `/about`, `CONTACT` → `mailto:` email.
  - 4 `[data-category-item]` links with the English titles.
  - every visible text node inside `header`, `h1`, `h2`, `nav`, `[data-category-item]` matches `/^[A-Z0-9 ·—&'’,.:\-\/→←]+$/` (main text is English).
  - `document.documentElement.scrollWidth <= window.innerWidth`.
  - no console errors.
  - footer shows `ILSAN, KOREA` (innerText), a `HH:MM KST` clock, and the email.
- [ ] **Step 2:** `npx playwright test tests/e2e/home.spec.ts` → FAIL.
- [ ] **Step 3:** Implement. Headline font-size `clamp(64px, 22vw, 360px)`, letter-spacing `-0.04em`. Hover/focus on a category item sets `body` background to its `data-bg` (CSS transition 400ms). Footer clock: tiny inline script using `Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})`, updates every 30s.
- [ ] **Step 4:** Run → PASS. Take screenshots `desktop-home.png`, `mobile-home.png` into scratchpad and look at them.
- [ ] **Step 5: Commit** `feat: home page, nav and footer`

---

### Task 7: Chrome 3D hero

**Files:**
- Create: `src/scripts/chrome-hero.ts`, `src/components/ChromeHero.astro`, `public/chrome-fallback.webp`; Modify: `src/pages/index.astro`
- Test: `tests/e2e/hero.spec.ts`

**Interfaces:**
- Consumes: `#hero-slot`, `[data-category-item]` (Task 6).
- Produces:
  ```ts
  export function mountChromeHero(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }):
    { setReflection(url: string | null): void; dispose(): void } | null;   // null = WebGL unavailable
  ```

- [ ] **Step 1: Write failing e2e** `hero.spec.ts`: canvas `#chrome-hero` exists and has non-zero size on desktop; with `page.emulateMedia({reducedMotion:'reduce'})` two screenshots of the canvas 500ms apart are byte-identical; with WebGL disabled (`launchOptions.args: ['--disable-webgl','--disable-3d-apis']` in a dedicated project) `img[src="/chrome-fallback.webp"]` is visible; no console errors.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Scene: `TorusKnotGeometry(1, 0.32, 256, 48)`, `MeshPhysicalMaterial({ metalness: 1, roughness: 0.08, clearcoat: 1 })`, environment from `RoomEnvironment` via `PMREMGenerator`; transparent background; pixel ratio `min(devicePixelRatio, 2)`; rotation eases toward pointer position (desktop) or auto-rotates 0.15 rad/s (touch); `setReflection(url)` loads the cover as `EquirectangularReflectionMapping` env, `null` restores the room env. Keep mesh creation in one `createShape(): THREE.Mesh` function so a Blender `.glb` can replace it later (spec §7). Load the script with Astro's client-side `<script>` so Three.js ships only on Home. Hover on category items calls `setReflection(data-cover || null)`. Generate `chrome-fallback.webp` by screenshotting the canvas once (Playwright, scratchpad script) and commit it.
- [ ] **Step 4:** Run → PASS. Screenshot desktop + mobile, view them.
- [ ] **Step 5: Commit** `feat: chrome 3D hero with fallback and reduced motion`

---

### Task 8: Works page (stacked cards)

**Files:**
- Create: `src/components/WorkStack.astro`, `src/scripts/work-stack.ts`, `src/pages/works/index.astro`
- Test: `tests/e2e/works.spec.ts`

**Interfaces:**
- Consumes: `loadSite()`, `config.pastels`.
- Produces: each card `<a class="work-card" href="/works/<slug>">` containing cover `<img>` or, when no cover, a pastel block with the English title.

- [ ] **Step 1: Write failing e2e**: title `WORKS — JUWON`; h1 `WORKS`; count label `04`; 4 `.work-card` links in Notion order; no `img` with empty or missing `src`; desktop: pressing `ArrowRight` makes card 2 get `[data-active]`; mobile: cards are laid out vertically (each card's `top` > previous card's `bottom - 1`); no horizontal scroll; clicking card 1 navigates to `/works/3d-design`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Desktop (≥768px): container `perspective: 1600px`; card i transform `translate3d(i*7vw, -i*4vh, -i*120px) rotateY(-28deg)`, active card brought to `translateZ(0) rotateY(0)`; wheel/arrow keys/click change active index (throttled 350ms). Mobile: plain vertical list, no transforms. Reduced motion: no transitions.
- [ ] **Step 4:** Run → PASS. Screenshots, view them.
- [ ] **Step 5: Commit** `feat: works page with stacked cards`

---

### Task 9: Work detail page

**Files:**
- Create: `src/components/BlockRenderer.astro`, `src/components/RichText.astro`, `src/pages/works/[slug].astro`
- Test: `tests/e2e/work.spec.ts`

**Interfaces:**
- Consumes: `Block`, `Work` types; `loadSite()`.
- Produces: `getStaticPaths()` over `site.works`; prev/next wrap around.

- [ ] **Step 1: Write failing e2e** on `/works/ai-generated`: h1 `AI GENERATED`; title `AI GENERATED — JUWON`; Korean body text `리플리-소녀의일기 EP 비주얼라이징 작업` visible; every `video` has attributes `muted`, `playsinline`, `loop`, `autoplay`, `controls`; every `iframe` has `loading="lazy"` and `allowfullscreen`; `NEXT →` links to `/works/2d-graphic`, `← PREV` to `/works/3d-design`; `CONTACT` button is a `mailto:` link; no console errors except third-party iframe noise (filter messages whose location URL is not our origin); no horizontal scroll.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Images `loading="lazy"` with width/height; first image `fetchpriority="high"`. Embeds in a 16:9 box (Instagram: 4:5). Tags as pills; `link` as `↗ LINK` pill. Body text max-width 680px; media full width up to 1600px.
- [ ] **Step 4:** Run → PASS. Screenshots of one detail page, desktop + mobile.
- [ ] **Step 5: Commit** `feat: work detail page with Notion block rendering`

---

### Task 10: About page

**Files:**
- Create: `src/pages/about.astro`
- Test: `tests/e2e/about.spec.ts`

- [ ] **Step 1: Write failing e2e**: title `ABOUT — JUWON`; h1 `ABOUT`; section headings exactly `EXPERIENCE`, `TOOLS`, `EXPERTISE`, `LANGUAGE`, `CONTACT`; first experience row contains `WNT Studio` and `26.09~`; `TOOLS` lists `Cinema4D`; page text does not contain `010-0000-0000`; email link `mailto:juwon0824@naver.com`; Instagram link `https://www.instagram.com/baboyeonggaam/` with `target="_blank" rel="noopener"`; no horizontal scroll.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Experience as two-column rows (period in mono, label in body font); rows without period span both columns. Tools/expertise/language as pills.
- [ ] **Step 4:** Run full suite `npm test && npx playwright test` → all PASS. Screenshots, view them.
- [ ] **Step 5: Commit** `feat: about page`

---

### Task 11: Deploy workflow and setup guide

**Files:**
- Create: `.github/workflows/deploy.yml`, `docs/SETUP.ko.md`, `README.md`; Modify: `astro.config.mjs` (`site: process.env.SITE_URL`)

- [ ] **Step 1:** Write `deploy.yml`:
  - triggers: `schedule: cron '7 * * * *'`, `push` to `main`, `workflow_dispatch`
  - permissions: `contents: read`, `pages: write`, `id-token: write`; `concurrency: pages`
  - job `build`: checkout → setup-node 22 with npm cache → `npm ci` → on `schedule` only: `npm run sync -- --check "$SITE_URL/sync-hash.txt"` (id `check`) → remaining steps run if `github.event_name != 'schedule' || steps.check.outputs.changed == 'true'`: `npm run sync` → `npm test` → `npm run build` → `npx playwright install --with-deps chromium` → `npx playwright test` → `actions/upload-pages-artifact` (`dist`)
  - job `deploy`: needs build, same condition, `actions/deploy-pages`
  - env: `NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}`, `SITE_URL: https://${{ github.repository_owner }}.github.io`
  - pin actions to current major versions (`actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-pages-artifact@v4`, `actions/deploy-pages@v4`) — check the latest majors at implementation time.
- [ ] **Step 2:** Verify: `npx --yes yaml-lint .github/workflows/deploy.yml` (or `node -e "require('yaml').parse(...)"`) parses; `act` is not available, so the live run happens in the user-setup phase.
- [ ] **Step 3:** Write `docs/SETUP.ko.md` (plain Korean, numbered, one action per step): ① add `영문 제목` text column to Projects ② create Notion integration at notion.so/profile/integrations, copy key, connect it to the "JUWON's ARCHIVES" page via ⋯ → 연결 ③ create GitHub repo named `<아이디>.github.io` (public) ④ Settings → Secrets and variables → Actions → `NOTION_TOKEN` ⑤ Settings → Pages → Source: GitHub Actions ⑥ Actions tab → "Deploy" → Run workflow ⑦ where to see failures. `README.md`: one paragraph + commands (`npm run sync`, `npm run dev`, `npm test`).
- [ ] **Step 4: Commit** `ci: hourly Notion sync and GitHub Pages deploy; setup guide`

---

### Task 12: Live connection (with the user)

- [ ] **Step 1:** Walk the user through `docs/SETUP.ko.md` one step at a time.
- [ ] **Step 2:** With the token in this session's env, run `npm run sync` locally → site.json matches the Notion page; `npm test && npx playwright test` → PASS.
- [ ] **Step 3:** Push to the user's repo; trigger the workflow; confirm the live URL shows the site; then edit something small in Notion, run the workflow again, confirm the change appears.
