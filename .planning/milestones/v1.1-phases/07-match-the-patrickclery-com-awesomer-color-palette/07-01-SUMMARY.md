---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 01
subsystem: ui-theme
status: complete
tags: [theme, catppuccin, dark-mode, tailwind, demo-export]
requires: []
provides:
  - "Single Catppuccin Mocha :root in globals.css (37 tokens, color-scheme dark)"
  - "bg-primary-hover / text-primary-hover / text-destructive-foreground utilities"
  - "Forced-dark ThemeProvider, static dark class and dark viewport in both layouts"
  - "verify-export rule i (demo export dark-only)"
affects: [07-02, 07-03]
tech-stack:
  added: []
  patterns:
    - "Tokens only in :root; colors never depend on a class"
    - "Parse globals.css in a node test to lock tokens and WCAG contrast"
key-files:
  created:
    - src/app/globals-css.test.ts
    - src/components/theme-provider.test.ts
  modified:
    - src/app/globals.css
    - src/components/theme-provider.tsx
    - src/app/layout.tsx
    - src/app/layout.demo.tsx
    - scripts/demo/verify-export.ts
    - src/demo/verify-export.test.ts
    - src/components/app-header.tsx
    - src/components/ui/sonner.tsx
decisions:
  - "Dark only via next-themes forcedTheme=dark plus static dark class; Phase 1 D-16 (follow OS) retired"
  - "Both layouts export viewport colorScheme dark so the demo root redirect shell (no layout class, no CSS) starts dark"
  - "verify-export rule i checks layout-rendered pages and 404.html, skipping the root redirect shell"
requirements-completed: [THEME-01, THEME-02, THEME-03, THEME-04, THEME-07]
metrics:
  duration: "~3 min"
  completed: 2026-10-26
actuals:
  tokens: 5300
  tasks: 3
  commits: 5
plan_head_before: 005d0e2a908704025761105d5f3171975d08dc85
plan_head_after: 4633013922ee6cc2f86b6b5e275e40a0603b78d0
---

# Phase 7 Plan 01: Catppuccin Mocha Tokens and Forced Dark Summary

The whole app and the demo export now paint Catppuccin Mocha from one `:root`, are always dark (forced provider, static `dark` class, dark color-scheme meta), and this is guarded by a token/contrast test, a forced-theme test and verify-export rule i. The header is translucent and blurred, and toasts are always dark.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Tracer: Mocha `:root`, forced dark in both layouts, proven in a real demo build | f00edcf (RED), ebb1933 (GREEN) |
| 2 | verify-export rule i and the forced-theme provider test | 28fb7bc (RED), 3c20c57 (GREEN) |
| 3 | Translucent blurred header and always-dark toasts | 4633013 |

## Tracer Gate

Auto mode: the Task 1 `<verify>` was run end to end before expanding. The demo build passed verify-export; `upload/index.html` has `<html class="dark …">`; the exported CSS contains `--primary-hover:#b4befe`; and the root redirect shell `index.html` carries `name="color-scheme" content="dark"`. So the viewport fallback note in the plan did not apply.

## Verification

- `vitest run`: 123 files, 2346 tests passed
- `tsc --noEmit` and `biome check`: clean
- Demo build: `[verify-export] PASS: 392 files, rules a-i`
- Smoke: `PASS 4 page(s), zero /api requests`

## TDD Gate Compliance

- Task 1: RED f00edcf (12 of 24 tests failing on the token map, leftovers and contrast), then GREEN ebb1933.
- Task 2: RED 28fb7bc (4 rule-i/PASS-line tests failing), then GREEN 3c20c57. The provider test passed in RED already, because Task 1 had already forced dark. It is a regression guard, not new behavior.
- No REFACTOR commits were needed.

## Deviations from Plan

None. The plan was executed exactly as written. I also added a small test that the reportVerify PASS line reads `rules a-i`, to cover that behavior bullet.

## Human Checks (end-of-phase)

- On a light-mode OS, pages render dark with no white flash on reload and have no theme toggle.
- The header shows bright spine photos through it, blurred, and the nav stays readable.
- The Settings save toast is dark slate, not white.

## Known Stubs

None.

## Self-Check: PASSED

- All created and modified files exist, and all 5 task commits are ancestors of HEAD.
