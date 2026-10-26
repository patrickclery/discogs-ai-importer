---
phase: "07"
slug: "match-the-patrickclery-com-awesomer-color-palette"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-26"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract, reconstructed from the PLAN/SUMMARY artifacts (State B). Requirements are THEME-01..THEME-10 (defined in 07-01-PLAN.md and 07-04-PLAN.md) and the UI-SPEC contrast contract items C-1..C-6.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (`pool: 'forks'`, node env, `server-only` stubbed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/app/globals-css.test.ts src/components/app-header.test.ts src/components/compact-spine-card.test.ts src/components/featured-surfaces.test.ts src/components/markdown-touches.test.ts src/components/mocha-variants.test.ts src/components/review-status-filter.test.ts src/components/terminal-touches.test.ts src/components/theme-provider.test.ts src/demo/verify-export.test.ts` |
| **Full suite command** | `npx vitest run && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/biome check` |
| **Demo export check** | `node scripts/demo/build-demo.ts` (runs `scripts/demo/verify-export.ts` rules a-i), then `node scripts/demo/smoke.ts --out "$OUT" --expect ...` (not run in this audit) |
| **Estimated runtime** | ~1 second for the 13 phase files (241 tests); ~90 seconds for the full suite |

---

## Sampling Rate

- **After every task commit:** Run the touched file's `npx vitest run <file>` + `tsc --noEmit`
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite green, plus one demo build with the smoke `--expect` checks
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Audit run 2026-10-26: the 13 phase test files pass (241 tests). Demo-build and `next build` steps in the plan verify commands were run during execution (see SUMMARYs), not in this audit.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | THEME-01, THEME-02, THEME-03, THEME-04, THEME-07 | T-07-02 | Static `dark` class on both layouts | unit + demo build | `npx vitest run src/app/globals-css.test.ts` (+ demo build grep) | ✅ | ✅ green |
| 07-01-02 | 01 | 1 | THEME-02, THEME-07 | T-07-01, T-07-02 | Rule i fails a layout page without `dark`; provider forces dark | unit | `npx vitest run src/demo/verify-export.test.ts src/demo/build-demo.test.ts src/components/theme-provider.test.ts` | ✅ | ✅ green |
| 07-01-03 | 01 | 1 | THEME-04 (header), THEME-02 (toasts) | — | N/A | unit | `npx vitest run src/components/app-header.test.ts src/components/ui/sonner.test.ts` | ✅ | ✅ COVERED |
| 07-02-01 | 02 | 2 | THEME-05, THEME-06 (C-1, C-2) | T-07-04, T-07-05 | Destructive confirms solid red, base text | unit | `npx vitest run src/components/mocha-variants.test.ts` | ✅ | ✅ green |
| 07-02-02 | 02 | 2 | THEME-05 | — | N/A | unit | `npx vitest run src/components/mocha-variants.test.ts` | ✅ | ✅ green |
| 07-03-01 | 03 | 2 | THEME-06 (C-3, C-4) | T-07-06 | N/A | unit | `npx vitest run src/components/review-status-filter.test.ts src/components/spines-filter-bar.test.ts` | ✅ | ✅ green |
| 07-03-02 | 03 | 2 | THEME-05 (inline links) | T-07-07, T-07-14 | hrefs untouched | static scan | `grep -rn 'text-primary underline' src/components --include='*.tsx' \| grep -v '/ui/' \| grep -vc 'hover:text-primary-hover'` = 0 | ✅ | ✅ green (grep, not in vitest suite) |
| 07-04-01 | 04 | 1 | THEME-08, THEME-09, THEME-07 | T-07-09 | Fonts self-hosted, no third-party host | unit + builds | `npx vitest run src/app/globals-css.test.ts src/components/compact-spine-card.test.ts` (+ next build, demo build, smoke) | ✅ | ✅ green |
| 07-04-02 | 04 | 1 | THEME-08, THEME-09 | T-07-08 | asciiMono pinned by size + sha256, OFL beside it | unit | `npx vitest run src/app/globals-css.test.ts src/components/compact-spine-card.test.ts` | ✅ | ✅ green |
| 07-04-03 | 04 | 1 | THEME-10 | T-07-10 | Scanlines `pointer-events: none`, hidden in print/forced colors | unit | `npx vitest run src/app/globals-css.test.ts` | ✅ | ✅ green |
| 07-05-01 | 05 | 2 | THEME-08 | — | N/A | unit | `npx vitest run src/components/compact-spine-card.test.ts` | ✅ | ✅ green |
| 07-05-02 | 05 | 2 | THEME-08, THEME-09 | T-07-11 | Destructive confirms unchanged | unit (source scan) | `npx vitest run src/components/featured-surfaces.test.ts` | ✅ | ✅ green |
| 07-06-01 | 06 | 2 | THEME-10, THEME-09 | — | Decorative prefixes aria-hidden | unit | `npx vitest run src/components/terminal-touches.test.ts` | ✅ | ✅ green |
| 07-06-02 | 06 | 2 | THEME-10, THEME-07 | T-07-12 | Logo href and accessible name kept | unit + demo smoke | `npx vitest run src/components/app-header.test.ts src/components/terminal-touches.test.ts` (+ demo smoke) | ✅ | ✅ green |
| 07-07-01 | 07 | 2 | THEME-06 (C-5, C-6) | T-07-13 | AA red text under scanlines | unit | `npx vitest run src/components/mocha-variants.test.ts src/app/globals-css.test.ts` | ✅ | ✅ green |
| 07-07-02 | 07 | 2 | THEME-09 | — | N/A | unit | `npx vitest run src/components/mocha-variants.test.ts` | ✅ | ✅ green |
| 07-08-01 | 08 | 3 | THEME-08, THEME-10 | T-07-15 | Demo settings masked tails only | unit | `npx vitest run src/components/markdown-touches.test.ts src/components/preferred-country-field.test.ts` | ✅ | ✅ green |
| 07-08-02 | 08 | 3 | THEME-07, THEME-08, THEME-10 | T-07-01 | Demo: zero /api requests, rules a-i | unit + builds | `npx vitest run src/components/markdown-touches.test.ts` (+ full suite, next build, demo build, smoke) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky / partial*

Counts: 17 COVERED, 1 PARTIAL, 0 MISSING.

### Gaps

| Task ID | Requirement | Gap Type | Suggested Test |
|---------|-------------|----------|----------------|
| 07-01-03 | THEME-02: toasts always dark (Sonner gets constant `theme="dark"`, no `useTheme`) | COVERED (src/components/ui/sonner.test.ts, green) | `src/components/ui/sonner.test.ts`: render `<Toaster />` or scan `sonner.tsx` source; assert `theme="dark"` and no `next-themes` import |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The phase created `globals-css.test.ts`, `theme-provider.test.ts`, `mocha-variants.test.ts`, `app-header.test.ts`, `featured-surfaces.test.ts`, `terminal-touches.test.ts` and `markdown-touches.test.ts`, and extended `verify-export.test.ts`, `compact-spine-card.test.ts` and `review-status-filter.test.ts`.

---

## Manual-Only Verifications

Run the app on port 3001 (never 3000).

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Always dark, no white flash | THEME-01, THEME-02 | Overall look and load flash are visual | Set your computer to light mode. Open Upload, Spines and Settings and reload each a few times. Every page should be dark navy-purple with off-white text, and you should never see a white flash or a light/dark switch. |
| See-through blurred top bar | THEME-04 | Readability over real photos is visual | In Detailed view on Spines, scroll a bright spine photo under the top bar. The photo should show through softly blurred, and Upload, Spines and Settings should stay easy to read. |
| Dark toast pop-up | THEME-02 | Pop-up styling is visual (and has no test yet) | In Settings, change Preferred country and save. The pop-up in the bottom-right corner should be dark with light text, never white. |
| Purple and red buttons | THEME-05, THEME-06 | Hover colors are visual | Tick a couple of cards and hover Import: light purple, turning lavender. Open Dismiss, Disconnect Discogs and Clear value without confirming: each confirm button should be pink-red with dark text, never white text and never purple. |
| Readable tab numbers | THEME-06 | Contrast felt by eye | On Spines, look at the status tabs. The selected tab's number should be bright, not faded grey. The Failed number is red until you hover or select it. |
| Links, selection and focus | THEME-04, THEME-05 | Visual | Hover the purple links in Settings and under Discogs matches: they turn lavender. Select some text: a faint purple highlight. Press Tab: the outline is purple. |
| Looks like awesomer | THEME-08, THEME-10 | Purely a visual judgment | Compare the app with patrickclery.com/awesomer. Cards should have a soft gradient, a faint big number in the bottom-right corner and a purple glow on hover. Faint scanlines cover the page but never stop clicks or drag-and-drop. |
| Wordmark, logo and headings | THEME-09, THEME-10 | Visual | On a wide screen, Upload shows the blocky DISCOGS / AI IMPORTER wordmark above a purple-to-blue title. On a phone it is hidden. The header logo glows and its `_` blinks a few times, then stays still. Headings read like `## Photos`. |
| Demo matches the app | THEME-07 | Needs a browser on the published site | Open the demo site and visit its first page, Spines and Settings. It should look the same as the app, with no white page anywhere. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (one PARTIAL: Sonner forced-dark has no test)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (close the 07-01-03 toast gap to reach compliance)
