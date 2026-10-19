---
phase: 01-foundation
plan: 05
subsystem: ui
tags: [nextjs, shadcn, tailwind, next-themes, status-polling]

requires:
  - phase: 01-01
    provides: GET /api/status, POST /api/dev/jobs, devHooksEnabled(), verify-skeleton harness
provides:
  - shadcn config (new-york, neutral) and 15 primitives in src/components/ui
  - UI-SPEC light/dark tokens incl. --success / --warning
  - ThemeProvider, AppHeader, NavLink, StatusIndicator (app:status-refresh contract)
  - / redirect, /upload and /spines empty states, error.tsx, /settings with dev-only Developer card
  - verify-skeleton UI assertions (steps e, e2, h2)
affects: [01-03, 01-04, phase-2]

tech-stack:
  added: [cn@0.5.0, class-variance-authority@0.7.1, lucide-react@1.59.0, radix-ui@1.8.1, sonner@2.0.8, tw-animate-css@1.4.0, shadcn@4.22.1]
  patterns:
    - "window event 'app:status-refresh' triggers an immediate status refetch"
    - "setTimeout-chained polling, one request in flight, paused while hidden"
    - "shadcn primitives import cn from the 'cn' package; src/lib/utils.ts re-exports it"

key-files:
  created:
    - components.json
    - src/lib/utils.ts
    - src/components/ui/*.tsx (15)
    - src/components/theme-provider.tsx
    - src/components/app-header.tsx
    - src/components/nav-link.tsx
    - src/components/status-indicator.tsx
    - src/components/dev-job-trigger.tsx
    - src/app/error.tsx
    - src/app/upload/page.tsx
    - src/app/spines/page.tsx
    - src/app/settings/page.tsx
  modified:
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - biome.json
    - src/app/globals.css
    - src/app/layout.tsx
    - src/app/page.tsx
    - scripts/verify-skeleton.ts

key-decisions:
  - "Owner approved cn@0.5.0 and shadcn@4.22.1 (dev); clsx and tailwind-merge dropped (current shadcn registry no longer uses them)"
  - "Biome override disables three rules (useSemanticElements, noArrayIndexKey, noDoubleEquals) for vendored src/components/ui only"
  - "error.tsx calls retry() when Next provides it (>=16.3, re-fetches server segment), else reset()"

requirements-completed: [FOUND-01, FOUND-04]

actuals:
  tokens: 16700
  tasks: 2
  commits: 2
plan_head_before: efb57ac7f66a5ca687defa22f92a7051379bb0fc
plan_head_after: 8cdf428f8ca8577e985e3a540475d66a24bfa60d

duration: 16min
completed: 2026-10-19
status: complete
---

# Phase 1 Plan 05: App Shell and Queue Test Job Summary

**shadcn/ui shell with UI-SPEC tokens, a sticky header whose StatusIndicator polls /api/status, routed empty-state pages, and a dev-only Queue test job card, all proven by verify-skeleton.**

## Performance

- **Duration:** ~16 min (including one package-legitimacy checkpoint)
- **Tasks:** 2/2
- **Files:** 34 changed

## Task Commits

1. **Task 1: shadcn, tokens, app shell.** Commit `2bb0eaf`.
2. **Task 2: pages, error page, dev trigger, verify assertions.** Commit `8cdf428`.

## Deviations from Plan

### Checkpoint

**Package legitimacy (T-01-SC).** The live shadcn `new-york-v4` registry now depends on `cn` (it replaces clsx and tailwind-merge) and on `shadcn` as a devDependency (for `@import "shadcn/tailwind.css"`). Neither was on the approved list. Execution stopped at a blocking-human checkpoint before anything was installed. The owner chose option 1, relayed by the orchestrator: approve both at exact pins and drop clsx and tailwind-merge. All seven shadcn packages were then installed with `pnpm add -E`, and the latest version of each equals its approved pin.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn init is interactive and needs `pnpm` on PATH**
- **Issue:** `init` with no components.json prompts for a v4 preset, which would not produce new-york. It also spawns a bare `pnpm` (ENOENT under corepack).
- **Fix:** Pre-wrote components.json (new-york, neutral, css vars, lucide). Then ran `shadcn init -y -f -b radix --no-reinstall utils` with a scratch `pnpm` shim (`exec corepack pnpm`) on PATH, followed by one `shadcn add` call.
- **Commit:** 2bb0eaf

**2. [Rule 3 - Blocking] Lint errors in vendored field.tsx**
- **Fix:** A biome `overrides` entry scoped to `src/components/ui/**`. The generated code is left unedited.
- **Commit:** 2bb0eaf

**3. [Rule 1 - Bug] reset() alone cannot recover from a server render error in Next 16.3+**
- **Fix:** error.tsx calls `retry()` when Next provides it and falls back to `reset()`. The acceptance grep still matches.
- **Commit:** 8cdf428

**4. [Rule 2 - Correctness] Header fit at 360px**
- **Issue:** With `px-6` and the 24px gap after the wordmark, the header came to about 364px at a 360px viewport.
- **Fix:** The header uses `px-4 sm:px-6` and `ml-4 sm:ml-6`. `main` keeps `px-6`.
- **Commit:** 2bb0eaf

**Other:** pnpm added `minimumReleaseAgeExclude: [shadcn@4.22.1]` to pnpm-workspace.yaml, and it is committed. `TooltipProvider` wraps the app in layout.tsx, as shadcn requires for tooltips.

## Verification

- `corepack pnpm lint`: no errors. `corepack pnpm typecheck`: passed.
- `corepack pnpm build`: succeeded with no warnings.
- `node scripts/verify-skeleton.ts`: `verify-skeleton OK` (steps a–i plus the new e2 and h2).
- Smoke test under `next dev`: /upload, /spines and /settings all return 200, and the Developer card is present.
- All acceptance greps for Tasks 1 and 2 pass: 15 primitives, 0 font-semibold, 0 caret or tilde ranges, 0 @anthropic-ai/sdk.
- The human check (polling transitions, theme switching, 360px layout) is deferred to the end of the phase.

## Known Stubs

None. The Upload "Open Settings" button is intentionally always shown until Plan 01-04 gates it on Claude CLI readiness. Settings has only the Developer card until Plans 01-03 and 01-04 add theirs.

## Self-Check: PASSED
