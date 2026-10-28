---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
verified: 2026-10-28T06:20:44Z
status: human_needed
score: 41/41 must-haves verified
covered_files:
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-01-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-01-SUMMARY.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-02-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-02-SUMMARY.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-03-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-03-SUMMARY.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-04-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-04-SUMMARY.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-05-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-05-SUMMARY.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-06-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-06-SUMMARY.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-07-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-07-SUMMARY.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-08-PLAN.md"
  - ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-08-SUMMARY.md"
  - "scripts/demo/verify-export.ts"
  - "src/app/fonts.ts"
  - "src/app/fonts/OFL.txt"
  - "src/app/fonts/ascii_mono.woff2"
  - "src/app/globals-css.test.ts"
  - "src/app/globals.css"
  - "src/app/layout.demo.tsx"
  - "src/app/layout.tsx"
  - "src/app/settings/page.demo.tsx"
  - "src/app/settings/page.tsx"
  - "src/app/upload/page.demo.tsx"
  - "src/app/upload/page.tsx"
  - "src/components/app-header.test.ts"
  - "src/components/app-header.tsx"
  - "src/components/ascii-wordmark.tsx"
  - "src/components/bulk-import-bar.tsx"
  - "src/components/bulk-status-line.tsx"
  - "src/components/claude-cli-card.tsx"
  - "src/components/compact-spine-card.test.ts"
  - "src/components/compact-spine-card.tsx"
  - "src/components/confirmed-match.tsx"
  - "src/components/corner-numeral.tsx"
  - "src/components/discogs-card.tsx"
  - "src/components/discogs-matches.tsx"
  - "src/components/disconnect-discogs-button.tsx"
  - "src/components/featured-surfaces.test.ts"
  - "src/components/markdown-touches.test.ts"
  - "src/components/md-prefix.tsx"
  - "src/components/mocha-variants.test.ts"
  - "src/components/photo-section.tsx"
  - "src/components/photo-status-list.tsx"
  - "src/components/review-status-filter.test.ts"
  - "src/components/review-status-filter.tsx"
  - "src/components/secret-field.tsx"
  - "src/components/spine-card.tsx"
  - "src/components/spines-view.tsx"
  - "src/components/terminal-touches.test.ts"
  - "src/components/theme-provider.test.ts"
  - "src/components/theme-provider.tsx"
  - "src/components/ui/alert-dialog.tsx"
  - "src/components/ui/alert.tsx"
  - "src/components/ui/badge.tsx"
  - "src/components/ui/button.tsx"
  - "src/components/ui/card.tsx"
  - "src/components/ui/dialog.tsx"
  - "src/components/ui/dropdown-menu.tsx"
  - "src/components/ui/empty.tsx"
  - "src/components/ui/field.tsx"
  - "src/components/ui/sonner.test.ts"
  - "src/components/ui/sonner.tsx"
  - "src/components/ui/toggle.tsx"
  - "src/demo/verify-export.test.ts"
covered_digest: "v3:sha256:dbf6c8cf411c8684d2b50ca039bd7c070b21984f2b51570ce0ecdaee587c69cd"
behavior_unverified: 0
overrides_applied: 3
overrides:
  - must_have: "On /spines Compact, in the app and the demo, every spine card is an awesomer mini card: a top-to-bottom surface gradient, a faint border that turns 40% mauve with a soft glow on hover, and a large faint mauve number (the spine number) behind the content in the bottom-right corner"
    reason: "Override covers only the corner-number clause. The owner removed all card numbering from review cards in phase 06 UAT (06-UAT.md G-06-side-2: 'we don't need the numbering on the cards at all', plus followup 1; 06-UI-SPEC amendment G-06-side-2/06-19; 07-UI-SPEC Card treatments note). The mini gradient, hover border and glow are still verified."
    accepted_by: "Patrick Clery (owner decision G-06-side-2)"
    accepted_at: "2026-10-26T00:00:00Z"
  - must_have: "The card opened by Edit spine on /spines Compact is awesomer's featured card: a 50% mauve border with a soft glow at rest, a solid mauve border and a stronger glow on hover, and a very large faint spine number (160px) in its bottom-right corner"
    reason: "Override covers only the 160px number clause. Per the owner's G-06-side-2 decision (06-UAT.md followup 1: the opened card still showed #3 and the corner number, so numbering was removed from SpineView too), the opened card has no number. The featured surface is still verified."
    accepted_by: "Patrick Clery (owner decision G-06-side-2)"
    accepted_at: "2026-10-26T00:00:00Z"
  - must_have: "Every card in the Detailed layout is a gradient mini card with the same 160px faint spine number. Only hovering adds a glow, so a long list does not glow uniformly"
    reason: "Override covers only the 160px number clause. Per the owner's G-06-side-2 decision (06-UAT.md followup 1), Detailed cards carry no '#n' and no corner number. The mini gradient and hover-only glow are still verified."
    accepted_by: "Patrick Clery (owner decision G-06-side-2)"
    accepted_at: "2026-10-26T00:00:00Z"
re_verification:
  previous_status: human_needed
  previous_score: 41/41
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open the app at http://127.0.0.1:3001 and visit Upload, Spines and Settings. Reload each page a few times. Then look closely at a plain part of the page."
    expected: "Every page has a dark navy-purple background with soft off-white text. Cards are a slightly lighter slate-purple. Reloading never flashes white, and there is no light/dark switch anywhere. All titles, labels, buttons and numbers use a typewriter-style font where every letter is the same width. Very faint horizontal lines cover the whole page, like an old computer monitor. Clicking, typing and dragging still work normally through them."
    why_human: "The overall look, the font and the faint lines can only be judged by eye in a real browser."
  - test: "Look at the top-left logo right after a page loads. Then make the window narrower than a laptop screen. Finally, on the Spines page in Detailed view, scroll so a bright spine photo slides under the top bar."
    expected: "The logo text 'Discogs AI Importer' is purple with a soft glow and ends in an underscore that blinks 5 times, then stays on. In a narrow window only the disc icon shows. The top bar is slightly see-through, the photo shows through it softly blurred, and Upload, Spines and Settings stay easy to read. (Optional: if you turn on 'reduce motion' in your computer's settings, the underscore does not blink at all.)"
    why_human: "Glow, blinking and the see-through bar are visual and timed."
  - test: "Open the Upload page in a wide window, then narrow it to phone width and widen it again. Drag a photo onto the drop area."
    expected: "Above the Upload title is a big block-letter sign reading DISCOGS over AI IMPORTER in glowing purple, with the blocks lined up cleanly. At phone width the sign disappears. The Upload title fades from purple to light blue. The line under it starts with a purple '>'. The panel below is titled '## Photos' with a purple '##'; with no photos it reads '> No photos yet. Photos you drop appear here with their progress.' Dropping a photo works as before."
    why_human: "Block-letter alignment, the color fade and the drop behaviour under the lines need a real browser."
  - test: "On the Spines page in Compact view, look at the spine cards and move the mouse over a few. If any card has an orphaned (warning) badge, hover that one too. Then click the pencil button at the top of one card, hover the opened card, and click Show less."
    expected: "Each card is slightly darker at the bottom than the top. No card shows a number anywhere: there is no '#1' label and no big faint number in the corner. Under the mouse a card gets a purple edge and a soft glow. An orphaned card keeps its warning-colored edge even under the mouse. The opened card has a purple edge and glow all the time and also shows no number; under the mouse its edge gets brighter and its glow stronger. Show less returns to the small card."
    why_human: "Fades and glows are visual."
  - test: "Switch the Spines page to Detailed view. Look at the page title, the line under it, each photo's heading and the cards, and move the mouse over a few cards."
    expected: "The Spines title fades from purple to light blue, and the line under it starts with a purple '>'. Each photo's heading reads '## ' followed by the file name, with no number in its corner. Every card has the same top-to-bottom fade and shows no number: no '#' label and no big faint number in the corner. Only the card under the mouse glows, so the long list does not glow all at once."
    why_human: "Visual layout and hover glow across a long list."
  - test: "Open Settings. Look at each card and its corner, and read the explanations. Hover the underlined purple links in the Discogs card. Then drag to select the title 'Discogs', copy it, and paste it somewhere."
    expected: "The Settings title fades purple to light blue, and the line under it starts with a purple '>'. Each card has a big faint number in its corner: 1 Claude CLI, 2 Discogs, 3 Data folder, and 4 Developer if that card shows. Card titles read '## Claude CLI', '## Discogs', '## Data folder' (and '## Developer') with a purple '##'. The explanation sentences and small helper text use a different, rounder font where letters are not all the same width; buttons, including any inside a warning box, stay in the typewriter font. Links are light purple and turn bluish lavender under the mouse, staying underlined. The pasted text is just 'Discogs', without the '##'."
    why_human: "Font differences, faint numbers and link hover colors are visual; copy-paste needs a real browser."
  - test: "On the Spines page, look at the row of status tabs (All is selected when the page opens). Move the mouse over other tabs. If a spine has failed, look at the Failed tab, then click it. Also hover and click Needs review and Fallback if they show."
    expected: "On the selected tab the number is bright off-white and easy to read, not faded grey. Hovering a tab brightens its number the same way. The Failed number is red when the tab is not selected and turns off-white once you hover or select it. Filtering works as before."
    why_human: "Readability of small numbers on the selected and hover backgrounds is visual."
  - test: "On the Spines page, tick a couple of cards so the bottom bar appears and hover its Import button. Then open each warning window without confirming: Dismiss on a card (then Keep spine), Disconnect Discogs in Settings (then Stay connected), and Clear value next to a saved Discogs key (then Keep value). Hover the red button in each."
    expected: "The bottom bar and every warning window have a purple edge with a soft glow and a subtle top-to-bottom fade, with no corner number. In each window the explanation text uses the rounder font, while the title and buttons stay in the typewriter font. The Import button is light purple with dark text and turns bluish lavender under the mouse. The confirm button in each window is solid pink-red with dark text and gets slightly deeper red under the mouse; its text is never white, and Clear value is never purple. Nothing is actually dismissed, disconnected or cleared."
    why_human: "Window surfaces, fonts and hover colors are visual."
  - test: "In Settings, change Preferred country and save, then change it back and save again."
    expected: "The confirmation pop-up in the bottom-right corner is dark slate with light text and a thin border, never white."
    why_human: "Pop-up styling is visual."
  - test: "Select some text on any page with the mouse, and also select some text you typed into a box (for example the search box on the Spines page or a field in Settings). Then press Tab a few times to move between buttons and fields."
    expected: "Selected text gets a faint purple highlight and keeps its own color, both on the page and inside a typing box, never a solid purple block. The outline that shows which button or field you are on is purple."
    why_human: "Selection and keyboard-focus colors are visual."
  - test: "Open the published demo site (or a fresh demo build) and visit its first page, Upload, Spines and Settings."
    expected: "The demo looks the same as the app: dark navy-purple with the faint lines, the typewriter font, the block-letter sign on Upload, gradient titles, '##' headings, and cards with a slight top-to-bottom fade. Only the Settings cards have faint corner numbers (1, 2 and 3; there is no Developer card in the demo); the spine cards show no number at all. There is no white flash or white page anywhere, including the very first page you land on."
    why_human: "Visual parity of the static demo with the app."
---

# Phase 7: Match the patrickclery.com/awesomer color palette — Verification Report

**Phase Goal:** Restyle the app to use the same color palette as https://patrickclery.com/awesomer (Catppuccin Mocha, dark only) and its overall terminal/markdown look: gradient cards with corner numbers, Geist Mono / IBM Plex Sans / asciiMono fonts, scanlines; applied through the existing Tailwind/shadcn theme tokens so every screen picks it up.
**Verified:** 2026-10-28T06:20:44Z
**Status:** human_needed
**Re-verification:** Yes. The earlier report (2026-10-26T08:58Z, 41/41) went stale because phase 06 gap work (G-06-side-2, 06-19 and followups 1-10, commits 4221bc9..c20cdd0) changed `bulk-status-line.tsx`, `compact-spine-card.tsx` and its test, and `spine-card.tsx`.

ROADMAP lists no explicit success criteria, so the must-haves are the 41 truths in the eight PLAN frontmatters.

**Owner decision applied:** in phase 06 UAT the owner removed all numbering from review cards: no `#n` and no corner number on the compact, opened or Detailed cards (06-UAT.md G-06-side-2 with followups 1-10, the 06-UI-SPEC amendment, and the 07-UI-SPEC Card treatments note). Truths 19, 23 and 24 are carried as PASSED (override) for their number clause only. The rest of each truth was re-checked. Settings cards keep their numbers 1-4.

## Goal Achievement

### Observable Truths

| # | Truth (grouped by plan) | Status | Evidence |
|---|-------|--------|----------|
| 1-6, 8-15 | 07-01..03 colors: Mocha tokens, forced dark, status colors, selection/focus/blurred header, dark toasts, demo dark rule, primary/destructive/link/neutral variants, readable toggle counts, filtering unchanged | ✓ VERIFIED | Nothing changed in `globals.css`, the layouts, `ui/*` or the filter since the last report. The phase test files pass (12 files, 201 tests). Fresh demo build: `PASS: 394 files, rules a-i`. Every demo page has `class="dark …"`. |
| 7 | No copy, layout or behavior changes beyond the restyle (the font clause is superseded by THEME-09) | ✓ VERIFIED | Unchanged. Later layout changes belong to phase 06 owner decisions, not to this restyle. |
| 16 | Whole UI in Geist Mono, Geist Sans gone | ✓ VERIFIED | `--font-sans`/`--font-mono` are unchanged. `<body class="min-h-full font-sans">` is in the demo export. |
| 17 | Plex and asciiMono self-hosted | ✓ VERIFIED | The fresh export has no `googleapis`/`gstatic` hits. |
| 18 | asciiMono byte-identical, ships with OFL | ✓ VERIFIED | The exported `ascii_mono.*.woff2` sha256 is `756de50e…`, the same as the source. |
| 19 | Compact cards are mini cards: gradient, 40% mauve hover glow (number clause overridden) | ✓ PASSED (override) | `compact-spine-card.tsx:159-168` is `<Card variant="mini">` with no `CornerNumeral`. The demo DOM shows 61 compact cards, 61 `card-mini`, 0 `data-corner-numeral` and 0 visible `#n`. Test at `compact-spine-card.test.ts:850-853` asserts no numeral. The override is the owner's G-06-side-2 decision. |
| 20 | Orphaned compact card keeps its warning border on hover | ✓ VERIFIED | `compact-spine-card.tsx:167` keeps `orphaned && 'border-warning/60'`. |
| 21 | Scanlines everywhere, click-through, hidden in print/forced-colors | ✓ VERIFIED | `globals.css` is unchanged and its tests pass. |
| 22 | Full v2 CSS block and --glow/--cyan tokens | ✓ VERIFIED | Unchanged. `globals-css.test.ts` passes. |
| 23 | Expanded compact card is featured (number clause overridden) | ✓ PASSED (override) | `photo-section.tsx:156` `featured={trailing !== undefined}` goes to `spine-card.tsx:106` `variant={featured ? 'featured' : 'mini'}`. c154409 removed the `CornerNumeral` and the `#n`. Test `compact-spine-card.test.ts:856` is "the expanded compact card is the featured card with no numbering". |
| 24 | Detailed cards are mini, glowing on hover only (number clause overridden) | ✓ PASSED (override) | The same `SpineCard` path with `featured=false`. Test `compact-spine-card.test.ts:866` is "a Detailed card is a mini card with no numbering". |
| 25 | Bulk bar and all dialogs on the featured surface, no numeral | ✓ VERIFIED | `bulk-import-bar.tsx:126` `card-featured`. `dialog.tsx` and `alert-dialog.tsx` are unchanged. `featured-surfaces.test.ts` passes. |
| 26 | Dialog and orphan explanations in Plex | ✓ VERIFIED | `spine-card.tsx:37` `font-prose` is still on the orphan explanation. |
| 27 | Destructive buttons, copy, focus and behavior unchanged | ✓ VERIFIED | Unchanged. The tests pass. |
| 28 | ASCII wordmark on /upload (app and demo), sm+ only, aria-hidden | ✓ VERIFIED | The demo smoke DOM for `upload/` contains `ascii-art`. |
| 29-30 | Upload gradient title, `>` intro, `## Photos` mini card | ✓ VERIFIED | Unchanged. Smoke finds `gradient-text` on `upload/`. |
| 31-32 | Glowing logo, 5-blink cursor; decorative prefixes | ✓ VERIFIED | The demo HTML has `glow-intense hidden lg:inline` and `cursor-blink`. |
| 33-36 | Destructive alert text, menu focus, Plex descriptions, buttons pinned to Geist Mono | ✓ VERIFIED | `ui/*` is unchanged. `mocha-variants.test.ts` passes. |
| 37 | Settings numbered 1-4 (Developer only when shown; demo 1-3) | ✓ VERIFIED | Unchanged by the owner decision. The demo settings DOM has exactly 3 `data-corner-numeral` with values `1 2 3` and 3 `card-mini`. In the app, `step={1}`/`step={2}` and literals 3 and 4 are in `settings/page.tsx:104,125`. |
| 38 | `##` Settings titles; Discogs paragraphs in Plex | ✓ VERIFIED | Unchanged. `markdown-touches.test.ts` passes. |
| 39 | Spines and Settings gradient titles, `>` intros | ✓ VERIFIED | Smoke finds `gradient-text` on `spines/`. |
| 40 | Photo headings `## <filename>`, no numeral | ✓ VERIFIED | `photo-section.tsx` is unchanged. |
| 41 | Demo shows the whole look, passes rules a-i, zero /api or off-base requests | ✓ VERIFIED | Fresh `build-demo.ts` gives `PASS: 394 files, rules a-i`. `smoke.ts` with 8 markers (ascii-art and gradient-text on upload, gradient-text, card-mini and data-compact-row on spines, card-mini, `## ` and Preferred country on settings) gives `PASS 4 page(s), zero /api requests`. |

**Score:** 41/41 truths verified (38 verified, 3 PASSED (override); 0 present, behavior-unverified)

### Required Artifacts

`verify.artifacts` passes for every plan: 07-01 9/9, 07-02 6/6, 07-03 4/4, 07-04 7/7, 07-05 6/6, 07-06 6/6, 07-07 6/6, 07-08 7/7.

### Key Link Verification

`verify.key-links` reports 20/23. All three misses are pattern text that no longer matches; none is broken wiring:

| Link | Pattern | Why it misses | Status |
|------|---------|---------------|--------|
| 07-04 `compact-spine-card.tsx → corner-numeral.tsx` | `CornerNumeral value={number} size="md"` | Removed on purpose (G-06-side-2). The card is still `<Card variant="mini">`. | PASSED (override) |
| 07-05 `spine-card.tsx → ui/card.tsx` | `size="lg"` (the numeral) | Removed on purpose (G-06-side-2, followup 1). `variant={featured ? 'featured' : 'mini'}` is still wired. | PASSED (override) |
| 07-08 `claude-cli-card.tsx → corner-numeral.tsx` | `CornerNumeral value={1}` | WR-03 moved the number to `value={step}`, and the page passes `step={1}`. | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Status |
|----------|------|--------|--------|
| Spine card number | `spineNumber(spine)` | Only in accessible names (`Edit spine #n`, `Show less of spine #n`) and the crop alt text. It is not drawn on the card (owner decision). | ✓ FLOWING (a11y only) |
| Photo headings | `photo.filename` | Photo row | ✓ FLOWING |
| Settings numerals | `step` | Page-owned constants | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-07 test files plus compact/expanded card tests | `npx vitest run` on 12 files | 201/201 passed | ✓ PASS |
| Types | `npx tsc --noEmit` | clean | ✓ PASS |
| Demo build + rules a-i | `node scripts/demo/build-demo.ts` | `PASS: 394 files, rules a-i` | ✓ PASS |
| Demo DOM + no /api | `smoke.ts --expect …` (8 markers) | `PASS 4 page(s), zero /api requests` | ✓ PASS |
| No numbers on demo spine cards; Settings 1-3 | headless Chrome `--dump-dom` | spines: 0 numerals, 0 `#n`, 61 mini cards; settings: numerals `1 2 3` | ✓ PASS |
| Font self-hosting | sha256 of the exported asciiMono; grep for Google font hosts | identical; no hits | ✓ PASS |

### Probe Execution

No probes are declared, so Step 7c does not apply.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|-------------|--------|----------|
| THEME-01 Mocha via tokens | 07-01 | ✓ SATISFIED | Truths 1, 7 |
| THEME-02 Dark only, no toggle | 07-01 | ✓ SATISFIED | Truths 2, 5 |
| THEME-03 Status colors | 07-01 | ✓ SATISFIED | Truth 3 |
| THEME-04 Selection, focus ring, blurred header | 07-01 | ✓ SATISFIED | Truth 4 |
| THEME-05 Lavender hover on accents | 07-02, 07-03 | ✓ SATISFIED | Truths 8, 10, 14 |
| THEME-06 WCAG AA (C-1..C-6) | 07-02, 07-03, 07-07 | ✓ SATISFIED | Truths 9, 12, 13, 33, 34 |
| THEME-07 Demo has the same look | 07-01, 07-04, 07-06, 07-08 | ✓ SATISFIED | Truths 6, 41 |
| THEME-08 Gradient cards and corner numerals | 07-04, 07-05, 07-06, 07-08 | ✓ SATISFIED (with override) | Gradient surfaces on every card (truths 19-20, 23-25). Corner numerals now only on the Settings cards (truth 37), per the owner's G-06-side-2 decision. |
| THEME-09 Fonts | 07-04..07-08 | ✓ SATISFIED | Truths 16-18, 26, 35-36, 38 |
| THEME-10 Scanlines, gradient titles, `##`/`>`, wordmark, glow and cursor | 07-04, 07-06, 07-08 | ✓ SATISFIED | Truths 21-22, 28-32, 39-40 |

All 10 IDs are claimed by plans, and none are orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| Files changed since the last report (`compact-spine-card.tsx`, `spine-card.tsx`, `bulk-status-line.tsx`, `top-match-row.tsx`, `import-state-badge.tsx`) | — | TBD/FIXME/XXX/TODO/HACK | — | None found |
| 07-04-PLAN.md, 07-05-PLAN.md, 07-08-PLAN.md | key_links | Numeral patterns are out of date | ℹ️ Info | Planning text only. See Key Link Verification. |
| compiled CSS | — | `.card-mini` flat fallback before `@supports (color-mix)` | ℹ️ Info | Emitted by the build. Current browsers get the gradient. |

### Human Verification Required

There are 11 owner checks in the frontmatter `human_verification`, the same set as before. Checks 4, 5 and 11 are reworded to the new behaviour: spine cards (compact, opened and Detailed) show no number, and only Settings keeps its faint corner numbers. Check 4 now says "the pencil button" in place of "Edit spine", because the compact card's Edit is now an icon.

### Gaps Summary

There are no gaps. Phase 06 removed the spine-card numbers on the owner's instruction, and the overrides record that. The rest of the awesomer look is unchanged: mini and featured gradient surfaces with hover glow, the orphan warning edge, Settings numerals 1-4, fonts, scanlines, gradient titles, `##`/`>` prefixes, the wordmark and the cursor. It holds in both the app code and a fresh demo export. What remains is the owner's visual sign-off.

---

_Verified: 2026-10-28T06:20:44Z_
_Verifier: Claude (gsd-verifier)_
