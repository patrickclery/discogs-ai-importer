---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 02
subsystem: ui-theme
status: complete
tags: [theme, catppuccin, buttons, badges, contrast]
requires: [07-01]
provides:
  - "Button/Badge default hover lavender (bg-primary-hover)"
  - "Solid-red destructive fills with base text (text-destructive-foreground), no white text anywhere in .tsx"
  - "Lavender hover on link variants and on links in Empty/Field descriptions"
  - "Clear value confirm rendered with variant=destructive"
affects: [07-03]
tech-stack:
  added: []
  patterns:
    - "Assert cva output on whitespace-split class tokens, not substrings"
key-files:
  created:
    - src/components/mocha-variants.test.ts
  modified:
    - src/components/ui/button.tsx
    - src/components/ui/badge.tsx
    - src/components/secret-field.tsx
    - src/components/ui/empty.tsx
    - src/components/ui/field.tsx
decisions:
  - "Clear value uses variant=destructive instead of a className override, since Slot concatenates classes and the primary fill won by CSS order"
requirements-completed: [THEME-05, THEME-06]
coverage:
  - deliverable: "Primary/link lavender hover and solid-red destructive variants"
    verification:
      - kind: unit
        ref: "src/components/mocha-variants.test.ts#buttonVariants (Mocha)"
        status: pass
      - kind: unit
        ref: "src/components/mocha-variants.test.ts#badgeVariants (Mocha)"
        status: pass
    human_judgment: true
    rationale: "Real hover colors and the Clear value dialog rendering are visual (plan human-check)"
  - deliverable: "Lavender hover for description links"
    verification:
      - kind: unit
        ref: "src/components/mocha-variants.test.ts#description links (Mocha)"
        status: pass
    human_judgment: false
metrics:
  duration: "~1 min"
  completed: 2026-10-26
actuals:
  tokens: 2200
  tasks: 2
  commits: 4
plan_head_before: ccb5f032865ecc387056235f9927783dac4e8a07
plan_head_after: 6d83c4fc8d7ab94c08668df1f3d1d50e0913ae92
---

# Phase 7 Plan 02: Mocha Interaction Colors Summary

Filled primary buttons and badges now hover to solid lavender. Every destructive fill is solid red with dark base text, with no white text and no 60% dark fill. Link variants and links in Empty/Field descriptions hover to lavender. The Clear value confirm now uses `variant="destructive"`, so it is red instead of the mauve it rendered before.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Lavender primary hover, solid-red destructive, Clear value destructive | 70cd6cb (RED), 15326f7 (GREEN) |
| 2 | Lavender hover for Empty/Field description links | 1bb40ce (RED), 6d83c4f (GREEN) |

## Verification

- `vitest run`: 124 files, 2355 tests passed
- `tsc --noEmit` and `biome check`: clean
- All acceptance greps pass. `grep -rl text-white src --include='*.tsx'` returns 0 files (it was 3).

## TDD Gate Compliance

- Task 1: RED 70cd6cb (6 of 7 failing; the ghost neutral-hover guard passed as expected), then GREEN 15326f7.
- Task 2: RED 1bb40ce (2 failing on the missing `text-primary-hover` token), then GREEN 6d83c4f.
- No REFACTOR commits were needed.

## Deviations from Plan

None. The plan was executed exactly as written. The only adjustment was inside the test itself: `renderToStaticMarkup` HTML-escapes `&` and `>` in the class attribute, so the test helper unescapes them before tokenizing. Without that, the description-link assertions could never pass.

## Known Stubs

None.

## Next

Ready for 07-03.

## Self-Check: PASSED

- All six key files exist, and all four commits are ancestors of HEAD.
