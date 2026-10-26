---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
fixed_at: 2026-10-25T21:00:00Z
review_path: .planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-10-25T21:00:00Z
**Source review:** .planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (fix_scope: all)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Rule i does not guard the root `index.html`, the demo's landing URL

**Files modified:** `scripts/demo/verify-export.ts`, `src/demo/verify-export.test.ts`
**Commit:** e52601b
**Applied fix:** Rule i now checks `out/index.html`. Layout pages still need the `dark` class on `<html>`. The root redirect shell passes on either the class or a `<meta name="color-scheme">` whose content is dark-only (it has `dark` and not `light`), and the attributes can be in any order. The failure message is unchanged. The old "skips the root redirect shell" test is replaced by six tests: meta passes, reordered meta passes, class passes, neither fails, `light dark` fails, and the meta does not excuse a layout page.

### IN-01: The header has no fallback when `backdrop-filter` is unsupported

**Files modified:** `src/components/app-header.tsx`, `src/components/app-header.test.ts` (new)
**Commit:** 682dc34
**Applied fix:** `bg-background/80 backdrop-blur-sm` became `bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80`, matching the photo-section headers. Browsers that support blur still render the locked `/80` with blur, so the locked decision is unchanged. The new test renders `AppHeader` (with NavLink and StatusIndicator mocked) and asserts the class tokens.

### IN-02: Text selection inside inputs is still solid mauve

**Files modified:** `src/components/ui/input.tsx`, `src/components/mocha-variants.test.ts`
**Commit:** 45d7878
**Applied fix:** Removed `selection:bg-primary selection:text-primary-foreground` from `Input`, so the UI-SPEC's global mauve-15% `::selection` applies inside inputs too. The test asserts that `Input` carries no `selection:` classes, and it fails against the old code.

### IN-03: The destructive menu-item focus state fails AA (currently unused)

**Files modified:** `src/components/ui/dropdown-menu.tsx`, `src/components/mocha-variants.test.ts`
**Commit:** cbb4779
**Applied fix:** Removed the `dark:data-[variant=destructive]:focus:bg-destructive/20` override, so the base `focus:bg-destructive/10` (about 4.6:1) applies. The test checks the source, because a Radix menu item only renders inside a portalled menu.

## Verification

All gates ran in the **main checkout** (`workflow.use_worktrees: false`, so no worktree was created).
- `npx vitest run`: 125 files and 2368 tests passed.
- `npx tsc --noEmit`: clean.
- `npx biome check` on the changed files: clean.
- `node scripts/demo/build-demo.ts`: `[verify-export] PASS: 392 files, rules a-i`. The real root shell is `<html id="__next_error__">` with `<meta name="color-scheme" content="dark"/>`, so the new assertion passes on the meta.

---

_Fixed: 2026-10-25T21:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
