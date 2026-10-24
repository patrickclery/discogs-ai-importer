---
phase: 05-stubbed-demo-site
verified: 2026-10-24T00:58:00Z
status: passed
score: 11/11 must-haves verified
covered_files: [".github/workflows/demo-pages.yml",".planning/phases/05-stubbed-demo-site/05-01-PLAN.md",".planning/phases/05-stubbed-demo-site/05-01-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-02-PLAN.md",".planning/phases/05-stubbed-demo-site/05-02-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-03-PLAN.md",".planning/phases/05-stubbed-demo-site/05-03-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-04-PLAN.md",".planning/phases/05-stubbed-demo-site/05-04-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-05-PLAN.md",".planning/phases/05-stubbed-demo-site/05-05-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-06-PLAN.md",".planning/phases/05-stubbed-demo-site/05-06-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-07-PLAN.md",".planning/phases/05-stubbed-demo-site/05-07-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-08-PLAN.md",".planning/phases/05-stubbed-demo-site/05-08-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-09-PLAN.md",".planning/phases/05-stubbed-demo-site/05-09-SUMMARY.md","README.md","biome.json","demo/fixtures/discogs.json","demo/fixtures/shelf.json","next.config.ts","package.json","scripts/demo/build-assets.demo.ts","scripts/demo/build-covers.demo.ts","scripts/demo/build-demo.ts","scripts/demo/record-discogs.demo.ts","scripts/demo/smoke.ts","scripts/demo/verify-export.ts","src/app/error.demo.tsx","src/app/layout.demo.tsx","src/app/page.demo.tsx","src/app/settings/page.demo.tsx","src/app/spines/page.demo.tsx","src/app/upload/page.demo.tsx","src/components/candidate-row.tsx","src/components/claude-cli-card.tsx","src/components/discogs-search-dialog.tsx","src/components/duplicate-import-dialog.tsx","src/components/test-claude-button.tsx","src/demo/asset-urls.test.ts","src/demo/asset-urls.ts","src/demo/boundaries.test.ts","src/demo/build-demo.test.ts","src/demo/cover-svg.test.ts","src/demo/cover-svg.ts","src/demo/demo-root.tsx","src/demo/dispatch.test.ts","src/demo/fetch-shim.ts","src/demo/fixtures.test.ts","src/demo/hooks.ts","src/demo/next-config.test.ts","src/demo/ops/account.test.ts","src/demo/ops/account.ts","src/demo/ops/imports.test.ts","src/demo/ops/imports.ts","src/demo/ops/review.test.ts","src/demo/ops/review.ts","src/demo/ops/uploads.test.ts","src/demo/ops/uploads.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes-coverage.test.ts","src/demo/routes.ts","src/demo/routes/account.ts","src/demo/routes/http.ts","src/demo/routes/imports.ts","src/demo/routes/read.ts","src/demo/routes/review.ts","src/demo/routes/uploads.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/demo/verify-export.test.ts","src/demo/workflow.test.ts","src/lib/asset-urls.ts","src/lib/claude-types.ts","src/server/claude/cli.ts","src/server/discogs/search.ts","src/server/settings.ts","vitest.demo.config.ts"]
covered_digest: "v3:sha256:bfb36d0d8fa424cc5664c7a55d853c136e852d8503d86537decf6bc61cf23f4b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 10/11
  gaps_closed:
    - "Owner click-through of the live demo (05-09 backstop): owner answered pass on 2026-10-23 (steps 1-11)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "5 of 61 recorded demo spines (22, 59, 01, 02, 07) show catno-stage candidates that the 52815b8 cascade would now reject (e.g. Kid606 -> Bohren & Der Club Of Gore)"
    category: other
    reason: "Fixtures are static recordings from the old cascade; the demo runtime never calls runCascade, so nothing breaks. Re-recording (owner-gated, real Discogs GETs) would bring the demo in line with the real app"
    evidence_status: "reproducible: catnoCorroborated logic applied to demo/fixtures/discogs.json"
---

# Phase 5: Stubbed Demo Site Verification Report

**Phase Goal:** A demo build anyone can open and play with end to end (upload, review spines, Discogs matches, confirm and "import"), with no calls to Claude or Discogs and no real credentials; every external call replaced by canned stub data.
**Verified:** 2026-10-24T00:58:00Z
**Status:** passed
**Re-verification:** Yes. The previous report went stale after the WR-01..WR-06 review fixes (e0ae9d8..eb6c7aa) and the catno cascade fix (52815b8).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DEMO-01: `NEXT_PUBLIC_DEMO=1` gives a static export under `/discogs-ai-importer`; the default config is unchanged | ✓ VERIFIED | `next.config.ts` `selectConfig()` returns the real config unless env is `1`, and now throws unless `DEMO_BUILD_VIA_SCRIPT=1` (WR-05). `build-demo.ts:171-174` sets both. `next-config.test.ts` covers the refusal, CI-alone refusal and marker-without-demo cases. CI run 40041291250 (eb6c7aa) built in place and passed |
| 2 | DEMO-02: no route handlers, server actions, proxy, SQLite, sharp or secrets in the export | ✓ VERIFIED | `verify-export.ts` is stricter: a missing server-reference manifest fails, the call-shape `createServerReference` regex, more forbidden strings, 6 secret patterns. CI: `[verify-export] PASS: 392 files, rules a-h (0 known secret values, 6 secret patterns)`. `verify-export.test.ts` has 12 tests. Live `/api/spines` returns 404 |
| 3 | DEMO-03: every client `/api` call is answered in the browser from memory that resets on reload | ✓ VERIFIED | `handle()` now catches handler throws, emits and returns 500 `{error:'failed'}` (WR-01, tested in `dispatch.test.ts`). The success path is unchanged. CI smoke: `PASS 4 page(s), zero /api requests` |
| 4 | DEMO-04: owner's shelf only, real-pipeline vision JPEG, thumb and 61 crops, no HEIC, no metadata | ✓ VERIFIED | Not touched since the last report. `fixtures.test.ts` passes. verify-export rule g passes in CI |
| 5 | DEMO-05: Discogs candidates recorded once, text only | ✓ VERIFIED | `discogs.json` is unchanged. The 52815b8 change keeps the `runCascade` signature, so the recorder still typechecks (`tsc` exit 0). The demo runtime does not import `search.ts` (grep) |
| 6 | DEMO-06: generated covers, not Discogs images | ✓ VERIFIED | Unchanged. `asset-urls.test.ts` passes, and the WR edit only adds a test line |
| 7 | DEMO-07: every review status and warning is seeded | ✓ VERIFIED | Unchanged. `read-model.test.ts` passes |
| 8 | DEMO-08: upload, settings, dialog, rescan, retry, change match, link existing and add another work in memory | ✓ VERIFIED | `ops/*.test.ts` and `settings-actions.test.ts` pass (src/demo: 223 tests including search.test) |
| 9 | DEMO-09: banner on every page | ✓ VERIFIED | Live upload, spines, settings and 404 HTML contain the banner. Root is a client redirect; CI smoke checks the rendered DOM of `/` for the banner, and it was OK |
| 10 | DEMO-10: Pages workflow from master, live | ✓ VERIFIED | `demo-pages.yml`: build job has `contents: read` and `persist-credentials: false`; `pages`/`id-token` are deploy-only; all actions are SHA-pinned; no `pull_request` trigger. `workflow.test.ts` pins these. Run 40041291250 deployed eb6c7aa and reported success. Live `/spines/` returns 200 with the banner |
| 11 | Owner click-through of the live demo end to end, then reload resets (05-09, backstop) | ✓ VERIFIED (owner-observed) | Owner answered "pass" on 2026-10-23 for steps 1-11. The later deploy changed only `handle()`'s throw path in the bundle; the success paths the owner clicked are byte-identical in source |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Required Artifacts

All artifacts from 05-01 to 05-09 exist, are substantive and are wired. The new test files `build-demo.test.ts`, `verify-export.test.ts` and `workflow.test.ts` exercise the WR-03 to WR-06 fixes directly.

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `build-demo.ts` | `next.config.ts` | `DEMO_BUILD_VIA_SCRIPT=1` env marker | WIRED (CI in-place build succeeded) |
| `fetch-shim.ts` | `routes.ts handle()` | same-origin `/api/*` dispatch, now with a try/catch | WIRED |
| `routes.ts` | `store.ts` | `emit()` on handler throw | WIRED (tested) |
| `record-discogs.demo.ts` | `search.ts runCascade` | value import (offline recorder only) | WIRED, compiles |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full suite | `npx vitest run` | 102 files, 1784/1785 passed. The 1 failure is `src/server/claude/cli.test.ts` process-group timing (phase 1, unrelated); it passes 3 of 3 runs in isolation | ✓ PASS (flaky noted) |
| Demo and search tests | `npx vitest run src/demo src/server/discogs/search.test.ts` | 17 files, 223 passed | ✓ PASS |
| Types | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `npx biome check` | 637 files, no issues | ✓ PASS |
| CI after fixes | `gh run view 40041291250 --log` | verify-export PASS, smoke OK on 4 pages with zero /api requests, deploy success | ✓ PASS |
| Live site | `curl` /, upload/, spines/, settings/, 404.html, api/spines | 200 with the banner (root redirects); /api returns 404 | ✓ PASS |

### Probe Execution

No probes are declared. The demo's own checks (verify-export, smoke) ran in CI for eb6c7aa, and their output is quoted above. No local demo build was run (D-20).

### Requirements Coverage

No REQUIREMENTS.md exists; the IDs come from 05-RESEARCH.md. DEMO-01 to DEMO-10 are each claimed by at least one plan (05-01 to 05-09) and are SATISFIED (truths 1-10). None is orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `demo/fixtures/discogs.json` | spines 22, 59, 01, 02, 07 | Stale vs the 52815b8 catno rule | ⚠️ Warning (advisory) | The demo shows 5 wrong catno matches that the real app would now skip. Functionally harmless |
| `src/server/claude/cli.test.ts` | 133 | Flaky `groupAlive` timing assertion | ℹ️ Info | Out of phase scope |

There are no debt markers in the changed files. IN-01 to IN-06 from the review remain open as Info.

### Human Verification Required

None outstanding. Enforcing HTTPS (step 12) is the owner's own D-16 step and does not block: the 05-09 truth accepts http or https.

### Gaps Summary

There are no gaps. The WR-01 to WR-06 fixes are tested and green in CI, and the hardened build was deployed and smoke-tested live. The catno cascade fix does not touch the demo runtime. Its only effect is that 5 recorded demo matches are now stale. Re-recording them is optional.

---

_Verified: 2026-10-24T00:58:00Z_
_Verifier: Claude (gsd-verifier)_
