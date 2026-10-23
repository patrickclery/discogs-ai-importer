---
phase: 05-stubbed-demo-site
plan: 08
subsystem: demo-deploy
tags: [demo, github-pages, ci, coverage]
status: complete

requires: ["05-04", "05-05", "05-07"]
provides:
  - "src/demo/routes-coverage.test.ts: D-03 gate between real route files, UI fetch call sites and the demo route table"
  - ".github/workflows/demo-pages.yml: 'Demo site' workflow (test, in-place CI build + verify-export, smoke, upload, deploy)"
  - "README.md: Demo section with the live link and the safe local build"
affects: [05-09]

actuals:
  tokens: 3500
  tasks: 2
  commits: 2
plan_head_before: 8f2b5f7012dbcacafcc668ebe53ab1d3d19c5aa8
plan_head_after: 4c9073aa276a78f043449332173b48a40a477e82

tech-stack:
  added: []
  patterns:
    - "Source-parsing coverage test: balanced-paren fetch( argument parser that expands template slots and same-condition URL/method ternaries"

key-files:
  created:
    - src/demo/routes-coverage.test.ts
    - .github/workflows/demo-pages.yml
  modified:
    - README.md

key-decisions:
  - "Template slot not preceded by '/' at the end of a URL is treated as a query-string suffix and dropped (spines-view `${qs}`)"
  - "A ternary URL and ternary method on the same condition are paired, not crossed (confirmed-match DELETE import / POST retry)"
  - "Demo route groups are enumerated by dynamically importing every src/demo/routes/*.ts exporting `routes`, and each route must be the one matchRoute returns (no dead or unregistered groups)"
  - "Deploy job inherits the top-level permissions; it repeats none"

metrics:
  duration: ~15 min
  completed: 2026-10-23
---

# Phase 5 Plan 08: Coverage gate, Pages workflow and README demo link Summary

D-03 mock-coverage test proving all 26 callable real (method, route) pairs and every UI fetch('/api/...') call resolve to a demo route with none invented, plus a least-privilege "Demo site" Pages workflow and a README Demo section, all committed locally only.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Mock-coverage gate (D-03) | 17e1406 | src/demo/routes-coverage.test.ts |
| 2 | Pages workflow and README demo section (D-01, D-19, D-20) | 4c9073a | .github/workflows/demo-pages.yml, README.md |

## What was built

- **routes-coverage.test.ts** (6 tests): real routes (regex over `export async function|const METHOD`, five exclusions) resolve via `matchRoute`; every `fetch(` call site in non-test `src/components` and `src/lib` (file:line in failures; `/api/dev/jobs` from dev-job-trigger excluded) resolves; every demo route maps to a real route + method; every group route is the one dispatched; a parser self-check covers the query-suffix, paired-ternary and in-slot-ternary cases. No gaps were found, so no demo route was added. Negative check: renaming the demo `/api/discogs/test` pattern failed three tests naming the real route, the call site `components/test-discogs-button.tsx:52` and the phantom route.
- **demo-pages.yml**: push to `master` + workflow_dispatch; permissions exactly contents: read, pages: write, id-token: write; concurrency `pages`; checkout@v7, pnpm/action-setup@v6, setup-node@v7 (Node 24, pnpm cache), frozen install, `vitest run src/demo`, configure-pages@v6, `build-demo.ts --in-place` (runs verify-export), smoke against `out` with the spines and settings markers, upload-pages-artifact@v5; deploy job on `refs/heads/master` in `github-pages` via deploy-pages@v5. No secrets referenced.
- **README**: Demo section after the intro with the github.io link, the simulated/reset-on-reload note, `pnpm demo:build` / `pnpm demo:smoke`, and the warning against a `NEXT_PUBLIC_DEMO=1` build in the checkout.

## Verification

- `vitest run`: 99 files, 1753 tests pass; `tsc --noEmit` and `biome check` clean; workflow YAML parses.
- `node scripts/demo/build-demo.ts` (scratch copy): verify-export PASS, 392 files; smoke PASS on 4 pages with all four markers, zero /api requests.
- Grep gates: `branches: [master]`, `pages: write`, `id-token: write`, `contents: read`, `build-demo.ts --in-place` each 1; `${{ secrets` 0; README github.io link 1.
- Nothing pushed; Pages not enabled; no GitHub API calls.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None beyond the plan's threat model (T-05-28..30 mitigated as planned).

## Self-Check: PASSED

- FOUND: src/demo/routes-coverage.test.ts, .github/workflows/demo-pages.yml, README.md demo section
- FOUND: 17e1406, 4c9073a (ancestors of HEAD)
