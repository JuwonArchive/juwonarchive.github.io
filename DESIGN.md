---
version: alpha
name: JUWON-portfolio
description: A bright, lab-like gallery. Work sits on a pure white canvas that tints to soft pastels per project; a single oversized wide-black wordmark carries the page while a chrome 3D object floats over it. Interface chrome is reduced to small mono labels and white pill buttons so the 3D, AI-motion and graphic work speaks first. References — Belen Jones, Dirt, AREA Technology, UNVEIL, CLOU Architects.

colors:
  canvas: "#FFFFFF"
  tint-ice: "#EEF3F8"
  tint-frost: "#E7EEF6"
  tint-mist: "#EAF1F4"
  tint-steel: "#E9ECF6"
  display: "#111111"
  ink: "#111111"
  muted: "#7B8794"
  hairline: "#DCE2E8"
  signal-white: "#F0FAFF"
  signal-sky: "#49C2FF"
  signal-blue: "#4963FD"
  signal-indigo: "#443BE3"
  surface: "#FFFFFF"
  on-ink: "#FFFFFF"

typography:
  display-hero:
    fontFamily: "Archivo Variable, Arial Black, sans-serif"
    fontSize: "clamp(64px, 22vw, 360px)"
    fontWeight: 900
    fontStretch: 125%
    lineHeight: 0.86
    letterSpacing: -0.04em
    textTransform: uppercase
  display-list:
    fontFamily: "Archivo Variable, Arial Black, sans-serif"
    fontSize: "clamp(36px, 8vw, 120px)"
    fontWeight: 900
    fontStretch: 125%
    lineHeight: 0.9
    letterSpacing: -0.035em
    textTransform: uppercase
  display-page:
    fontFamily: "Archivo Variable, Arial Black, sans-serif"
    fontSize: "clamp(48px, 12vw, 200px)"
    fontWeight: 900
    fontStretch: 125%
    lineHeight: 0.86
    letterSpacing: -0.04em
  body-ko:
    fontFamily: "Pretendard Variable, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
    wordBreak: keep-all
  label-mono:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.04em
    textTransform: uppercase

radius:
  pill: 999px
  card: 6px

spacing:
  gutter: "clamp(16px, 2.2vw, 32px)"
  section: "clamp(64px, 12vw, 160px)"
  text-measure: 680px
  media-max: 1600px
---

# JUWON — Design System

## Overview

A bright, lab-like 3D gallery for a 3D · AI · graphic designer. The page is mostly empty
off-white; three things own it: one huge wide-black English word, one chrome 3D object, and the
work itself. Everything else — navigation, labels, metadata — is tiny monospace on white pills.
Personality comes from scale contrast (360px wordmark next to 11px labels) and from the 3D
object reflecting the work, not from decoration.

## Colors

### Surface
- **Canvas** `#FFFFFF` — pure white page background. Pills and cards separate from it by their 1px hairline border, not by tone.
- **Tints** `#E6E4F2` lavender, `#E3EEE8` mint, `#F2E6E4` blush, `#E4ECF2` sky — each work owns one tint (cycled in order). The page background crossfades to it on hover (400ms).
- **Surface** `#FFFFFF` — pills, cards, placeholders.

### Text
- **Ink** `#111111` — all text and the active pill.
- **Muted** `#6B6B6B` — metadata, periods, captions.

### Lines
- **Hairline** `#DDDDDD` — 1px pill borders and dividers. No other borders.

There is no brand accent color. Color comes from the work and the tints.

## Typography

### Font Family
- **Archivo Variable** at width 125%, weight 900 — every display word. Always English, always uppercase.
- **Pretendard Variable** — Korean body text from Notion. `word-break: keep-all`.
- **Geist Mono Variable** — nav, pills, labels, dates, footer.

All fonts are bundled from npm; no external font requests.

### Hierarchy
| Role | Font | Size | Use |
|---|---|---|---|
| Hero | Archivo 900/125% | clamp(64px, 22vw, 360px) | `JUWON` on Home only |
| Page title | Archivo 900/125% | clamp(48px, 12vw, 200px) | `WORKS`, `ABOUT`, work titles |
| List | Archivo 900/125% | clamp(36px, 8vw, 120px) | Home category list |
| Section label | Geist Mono | 11px uppercase | `EXPERIENCE`, `TOOLS` … |
| Body | Pretendard | 16px / 1.65 | Notion text |

### Principles
- Main text (headings, nav, buttons, section titles) is **English only**. Korean appears only in Notion body text and experience labels.
- Tight negative tracking on display (-0.04em); positive tracking on mono (+0.04em).

## Layout

- Gutter `clamp(16px, 2.2vw, 32px)` on every edge.
- Nav pinned top, footer pinned bottom on Home; content fills the viewport between.
- Body text measure 680px; media up to 1600px wide, centered.
- No horizontal scroll at 390px.

## Elevation & Depth

Flat UI. Depth comes only from real 3D: the chrome object on Home and the perspective card
stack on Works. No drop shadows on UI chrome.

## Shapes

- Pills: fully rounded (999px), 28px high, 1px hairline border.
- Cards and media: 6px radius.

## Components

### Navigation
Top-left wordmark `JUWON` in mono; top-right pills `WORKS` `ABOUT` `CONTACT`. Current page pill is ink-filled.

### Buttons (pills)
White background, hairline border, mono 11px uppercase. Hover / active / current: ink background, white text.

### Category list (Home)
Stacked display-list words. Hover: word turns ink, others drop to 25% opacity; page tints; the chrome object reflects that work's cover.

### Work card (Works)
Cover image in a 4:5 card with a mono caption row (`01` · title · tags). No cover → tint block with the title.

### Footer
Mono row: `ILSAN, KOREA` · live `HH:MM KST` · email.

## Motion

- Ease `cubic-bezier(0.22, 1, 0.36, 1)`; 200ms for UI, 400ms for tints, 600ms for card stack moves.
- The chrome object eases toward the pointer; auto-rotates slowly on touch devices.
- `prefers-reduced-motion: reduce` removes all motion.

## Do's and Don'ts

### Do
- Let one huge English word carry each page.
- Keep UI chrome tiny and monochrome.
- Use the work's own imagery for color.

### Don't
- Don't add an accent color, gradients or shadows to UI.
- Don't use Korean in headings, nav or buttons.
- Don't put more than one display-size word per screen except the Home category list.


## Mood update (2026-11-03): cold & experimental

- Display words and small text are **Ink `#111111`** (black, user decision); Muted `#7B8794` for secondary labels.
- Tints are icy (ice, frost, mist, steel). No warm tones anywhere.
- Home: JUWON at the bottom; a small mono top bar (label left, visitor's local time right). Behind, a 3D orbital line drawing (tilted orbits, dashed meridians, centre ellipses) is read through a halftone screen — variant ③: faint along the orbits at rest, revealed in a soft circle around the pointer (`#E6EBF0` dots 1–3px on a 7px grid, no background micro-dots; ink field computed on the CPU, no GPU readback), with a crisp thin version on top whose markers carry the tool names. Rotates slowly, turns toward the pointer, Plain white, no fog.
- Home layout (2026-11-04): phones keep JUWON big and centred at the bottom with the sphere fitted in the band between the top bar and JUWON; desktop puts a smaller JUWON (clamp(40px, 6.2vw, 96px)) bottom-left just above the info line, with the sphere centred on the page at radius min(17vw, 28vh); on phones the sphere radius is at most 24vw.

## Home ↔ Archive link (2026-11-04)

- The orbit markers are the archive boxes: `01 3D DESIGN` … (muted number, ink title, the same caption as the box) and each one opens its box.
- The sphere borrows the boxes' acrylic: a frosted glass gradient inside, a white inner rim, and outline/grid/guides in the box edge colour `#28345A` at low opacity. Only the three orbits stay ink.
- Desktop JUWON (bottom-left, above the info line) is `clamp(48px, 8vw, 132px)`.
