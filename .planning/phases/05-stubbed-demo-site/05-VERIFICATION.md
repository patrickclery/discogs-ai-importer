---
phase: 05-stubbed-demo-site
verified: 2026-10-28T19:34:34Z
status: passed
score: 11/11 must-haves verified
covered_files: [".github/workflows/demo-pages.yml",".planning/phases/05-stubbed-demo-site/05-01-PLAN.md",".planning/phases/05-stubbed-demo-site/05-01-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-02-PLAN.md",".planning/phases/05-stubbed-demo-site/05-02-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-03-PLAN.md",".planning/phases/05-stubbed-demo-site/05-03-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-04-PLAN.md",".planning/phases/05-stubbed-demo-site/05-04-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-05-PLAN.md",".planning/phases/05-stubbed-demo-site/05-05-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-06-PLAN.md",".planning/phases/05-stubbed-demo-site/05-06-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-07-PLAN.md",".planning/phases/05-stubbed-demo-site/05-07-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-08-PLAN.md",".planning/phases/05-stubbed-demo-site/05-08-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-09-PLAN.md",".planning/phases/05-stubbed-demo-site/05-09-SUMMARY.md","README.md","biome.json","demo/fixtures/discogs.json","demo/fixtures/shelf.json","next.config.ts","package.json","scripts/demo/build-assets.demo.ts","scripts/demo/build-covers.demo.ts","scripts/demo/build-demo.ts","scripts/demo/record-discogs.demo.ts","scripts/demo/smoke.ts","scripts/demo/verify-export.ts","src/app/error.demo.tsx","src/app/layout.demo.tsx","src/app/page.demo.tsx","src/app/settings/page.demo.tsx","src/app/spines/page.demo.tsx","src/app/upload/page.demo.tsx","src/components/candidate-row.tsx","src/components/claude-cli-card.tsx","src/components/discogs-search-dialog.tsx","src/components/duplicate-import-dialog.tsx","src/components/test-claude-button.tsx","src/demo/asset-urls.test.ts","src/demo/asset-urls.ts","src/demo/boundaries.test.ts","src/demo/build-demo.test.ts","src/demo/cover-svg.test.ts","src/demo/cover-svg.ts","src/demo/demo-root.tsx","src/demo/dispatch.test.ts","src/demo/fetch-shim.ts","src/demo/fixtures.test.ts","src/demo/hooks.ts","src/demo/next-config.test.ts","src/demo/ops/account.test.ts","src/demo/ops/account.ts","src/demo/ops/bulk.test.ts","src/demo/ops/bulk.ts","src/demo/ops/imports.test.ts","src/demo/ops/imports.ts","src/demo/ops/review.test.ts","src/demo/ops/review.ts","src/demo/ops/uploads.test.ts","src/demo/ops/uploads.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes-coverage.test.ts","src/demo/routes.ts","src/demo/routes/account.ts","src/demo/routes/bulk.test.ts","src/demo/routes/bulk.ts","src/demo/routes/http.ts","src/demo/routes/imports.ts","src/demo/routes/read.ts","src/demo/routes/review.ts","src/demo/routes/uploads.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/demo/verify-export.test.ts","src/demo/workflow.test.ts","src/lib/asset-urls.ts","src/lib/claude-types.ts","src/server/claude/cli.ts","src/server/discogs/search.ts","src/server/settings.ts","vitest.demo.config.ts"]
covered_digest: "v3:sha256:a2bebb87f34773bf4a01109633592de65c9419d8bf8410ecd74a039e9e245824"
behavior_unverified: 0
overrides_applied: 0
overrides:
  - must_have: "Demo compact review cards match the phase 05 card layout, including the visible spine number"
    reason: "Owner decision in phase 06: compact cards were reworked (six-row subgrid, pencil Edit, no on-screen card numbering, G-06-side-2). The number remains in aria-labels and alt text. No phase 05 truth depends on it."
    accepted_by: "patrick"
    accepted_at: "2026-10-28T19:34:34Z"
  - must_have: "Demo keeps the phase 05 look: light/dark theme, Geist fonts and card corner numerals"
    reason: "Owner decision in phase 07 (awesomer restyle): the demo is dark-only (verify-export rule i enforces it), fonts changed to Plex Sans / Geist Mono / ASCII mono, and corner numerals were removed (G-07-side-2). No phase 05 truth depends on theme, fonts or numerals."
    accepted_by: "patrick"
    accepted_at: "2026-10-28T19:34:34Z"
re_verification:
  previous_status: passed
  previous_score: 11/11
  gaps_closed: []
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "5 of 61 recorded demo spines (22, 59, 01, 02, 07) show catno-stage candidates that the 52815b8 cascade would now reject (e.g. Kid606 -> Bohren & Der Club Of Gore)"
    category: other
    reason: "Carried forward. Fixtures are static recordings from the old cascade; the demo runtime never calls runCascade, so nothing breaks. Re-recording (owner-gated, real Discogs GETs) would bring the demo in line with the real app"
    evidence_status: "reproducible: catnoCorroborated logic applied to demo/fixtures/discogs.json"
  - finding: "The live Pages site still serves eb6c7aa (phase 05 end); master is 258 commits ahead of origin, so the phase 06-07 demo changes are verified locally but not yet deployed"
    category: other
    reason: "Deploy happens on push to master (demo-pages.yml unchanged). Pushing will publish the bulk and dark-only demo; not a phase 05 gap"
    evidence_status: "git status -sb: ahead 258; gh run list: last Demo site run 40041291250 on eb6c7aa"
---

# Phase 5: Stubbed Demo Site Verification Report

**Phase Goal:** A demo build anyone can open and play with end to end (upload, review spines, Discogs matches, confirm and "import"), with no calls to Claude or Discogs and no real credentials; every external call replaced by canned stub data.
**Verified:** 2026-10-28T19:34:34Z
**Status:** passed
**Re-verification:** Yes. The previous report (2026-10-24, passed 11/11) went stale because phases 06 (bulk import) and 07 (awesomer restyle) changed 18 covered files.

## What changed since the last report

- Phase 06 added the demo bulk import (`src/demo/ops/bulk.ts`, `src/demo/routes/bulk.ts`, canned `demo/fixtures/pressings.json`), bulk fields in the read model and store, preferred/fallback country settings with demo twins, and `?fallback=1` on `/spines`. `startImport`/`retrySpine` gained a guard that only fires while a bulk item is finding its pressing.
- Phase 07 restyled the demo layout (dark class plus `colorScheme: 'dark'` viewport, new fonts), added the wordmark and `##`/`>` prefixes, and added verify-export rule i (dark-only).
- None of these add a server import, a network call or a secret to the demo bundle. The only `@/server` references in demo code are `import type` (erased at build).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DEMO-01: `NEXT_PUBLIC_DEMO=1` gives a static export under `/discogs-ai-importer`; the default config is unchanged | ✓ VERIFIED | `next.config.ts` unchanged since last report. Local `node scripts/demo/build-demo.ts` exit 0, 5 static routes. `next-config.test.ts` passes |
| 2 | DEMO-02: no route handlers, server actions, proxy, SQLite, sharp or secrets in the export | ✓ VERIFIED | Local build: `[verify-export] PASS: 394 files, rules a-i (5 known secret values, 6 secret patterns)`. Rules a-h unchanged; rule i was added. New bulk code imports only `@/lib/*`, fixtures and demo modules |
| 3 | DEMO-03: every client `/api` call is answered in the browser from memory that resets on reload | ✓ VERIFIED | `fetch-shim.ts` unchanged; `routes.ts` now also registers `bulkRoutes` (`POST /api/spines/bulk-import`). `routes-coverage.test.ts` and `routes/bulk.test.ts` pass. Local smoke: `PASS 4 page(s), zero /api requests` |
| 4 | DEMO-04: owner's shelf only, real-pipeline vision JPEG, thumb and 61 crops, no HEIC, no metadata | ✓ VERIFIED | `shelf.json` and assets unchanged; `fixtures.test.ts` passes; verify-export rule g passes |
| 5 | DEMO-05: Discogs candidates recorded once, text only | ✓ VERIFIED | `discogs.json` unchanged; the new `pressings.json` is also canned text. Demo runtime does not import `search.ts`. `tsc` exit 0 |
| 6 | DEMO-06: generated covers, not Discogs images | ✓ VERIFIED | `cover-svg.ts`/`asset-urls.ts` unchanged; tests pass |
| 7 | DEMO-07: every review status and warning is seeded | ✓ VERIFIED | `read-model.test.ts` passes (now +218 lines covering bulk fields); seed adds `bulkRuns`/`bulkItems` empty and country defaults |
| 8 | DEMO-08: upload, settings, dialog, rescan, retry, change match, link existing and add another work in memory | ✓ VERIFIED | `ops/*.test.ts` (incl. new `bulk.test.ts`) and `settings-actions.test.ts` pass. The new import/retry guards are inert without a running bulk item |
| 9 | DEMO-09: banner on every page | ✓ VERIFIED | `demo-root.tsx` unchanged. Local smoke checks the rendered DOM of all 4 pages for the banner: PASS |
| 10 | DEMO-10: Pages workflow from master, live | ✓ VERIFIED | `demo-pages.yml` unchanged; `workflow.test.ts` passes. Last run 40041291250 succeeded; live upload/, spines/, settings/ carry the banner, `/api/spines` ends 404 |
| 11 | Owner click-through of the live demo end to end, then reload resets (05-09, backstop) | ✓ VERIFIED (owner-observed) | Owner passed steps 1-11 on 2026-10-23. Since then the clicked paths changed only in look (phase 07, override) and card layout (phase 06, override); behavior changes are additive bulk paths covered by tests. Phases 06 and 07 UATs (14 and 11 passed) exercised the demo |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Overrides

Two owner decisions are recorded as overrides so later verifiers do not flag them: the phase 06 compact-card rework with no card numbering (G-06-side-2), and the phase 07 restyle (dark-only, new fonts, no corner numerals, G-07-side-2). No phase 05 truth needed them to pass, so `overrides_applied` is 0.

### Required Artifacts

All artifacts from 05-01 to 05-09 still exist, are substantive and are wired. New phase 06 demo artifacts (`ops/bulk.ts`, `routes/bulk.ts`) are registered in `routes.ts` and tested.

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `build-demo.ts` | `next.config.ts` | `DEMO_BUILD_VIA_SCRIPT=1` env marker | WIRED (local build succeeded) |
| `build-demo.ts` | `verify-export.ts` | `verifyExport()` after build | WIRED (rules a-i PASS) |
| `fetch-shim.ts` | `routes.ts handle()` | same-origin `/api/*` dispatch | WIRED |
| `routes.ts` | `routes/bulk.ts` | `...bulkRoutes` | WIRED (tested) |
| `record-discogs.demo.ts` | `search.ts runCascade` | value import (offline recorder only) | WIRED, compiles |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full suite | `npx vitest run` | 130 files, 2471/2473. 2 failures were 5 s timeouts in `src/server/scan/match.test.ts` under full-suite load (phase 1); rerun in isolation 10/10 | ✓ PASS (flaky noted) |
| Demo and search tests | `npx vitest run src/demo src/server/discogs/search.test.ts` | 19 files, 282 passed | ✓ PASS |
| Types | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `npx biome check src` | 380 files, no issues | ✓ PASS |
| Demo build | `node scripts/demo/build-demo.ts` | exit 0, verify-export PASS rules a-i | ✓ PASS |
| Smoke | `node scripts/demo/smoke.ts` | `PASS 4 page(s), zero /api requests` (ephemeral port, not 3000/3001) | ✓ PASS |
| Live site | `curl` upload/, spines/, settings/, api/spines | banner present; api 301 then 404 | ✓ PASS |

### Probe Execution

No probes are declared. The demo's own checks (build-demo with verify-export, smoke) were run locally on HEAD; output quoted above.

### Requirements Coverage

No REQUIREMENTS.md exists; IDs come from 05-RESEARCH.md. DEMO-01 to DEMO-10 are each claimed by a plan (05-01 to 05-09) and are SATISFIED (truths 1-10). None orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `demo/fixtures/discogs.json` | spines 22, 59, 01, 02, 07 | Stale vs the 52815b8 catno rule | ⚠️ Warning (advisory) | Demo shows 5 catno matches the real app would skip. Harmless |
| `src/server/scan/match.test.ts` | 229 | Timeout under full-suite load | ℹ️ Info | Out of phase scope; passes in isolation |

No TBD/FIXME/XXX markers in the changed demo files.

### Human Verification Required

None outstanding.

### Gaps Summary

No gaps. Phases 06 and 07 extended the demo (bulk import, country settings, dark-only restyle) without breaking any phase 05 truth: the export still builds, passes every verify-export rule (now a-i), makes zero `/api` requests in the smoke run, and shows the banner on every page. The visual changes are owner decisions recorded as overrides. The live site will pick up these changes on the next push.

---

_Verified: 2026-10-28T19:34:34Z_
_Verifier: Claude (gsd-verifier)_
