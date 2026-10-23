---
phase: 05-stubbed-demo-site
verified: 2026-10-23T18:44:58Z
status: human_needed
score: 10/11 must-haves verified
covered_files: [".github/workflows/demo-pages.yml",".planning/phases/05-stubbed-demo-site/05-01-PLAN.md",".planning/phases/05-stubbed-demo-site/05-01-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-02-PLAN.md",".planning/phases/05-stubbed-demo-site/05-02-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-03-PLAN.md",".planning/phases/05-stubbed-demo-site/05-03-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-04-PLAN.md",".planning/phases/05-stubbed-demo-site/05-04-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-05-PLAN.md",".planning/phases/05-stubbed-demo-site/05-05-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-06-PLAN.md",".planning/phases/05-stubbed-demo-site/05-06-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-07-PLAN.md",".planning/phases/05-stubbed-demo-site/05-07-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-08-PLAN.md",".planning/phases/05-stubbed-demo-site/05-08-SUMMARY.md",".planning/phases/05-stubbed-demo-site/05-09-PLAN.md",".planning/phases/05-stubbed-demo-site/05-09-SUMMARY.md","README.md","biome.json","demo/fixtures/discogs.json","demo/fixtures/shelf.json","next.config.ts","package.json","scripts/demo/build-assets.demo.ts","scripts/demo/build-covers.demo.ts","scripts/demo/build-demo.ts","scripts/demo/record-discogs.demo.ts","scripts/demo/smoke.ts","scripts/demo/verify-export.ts","src/app/error.demo.tsx","src/app/layout.demo.tsx","src/app/page.demo.tsx","src/app/settings/page.demo.tsx","src/app/spines/page.demo.tsx","src/app/upload/page.demo.tsx","src/components/candidate-row.tsx","src/components/claude-cli-card.tsx","src/components/discogs-search-dialog.tsx","src/components/duplicate-import-dialog.tsx","src/components/test-claude-button.tsx","src/demo/asset-urls.test.ts","src/demo/asset-urls.ts","src/demo/boundaries.test.ts","src/demo/cover-svg.test.ts","src/demo/cover-svg.ts","src/demo/demo-root.tsx","src/demo/dispatch.test.ts","src/demo/fetch-shim.ts","src/demo/fixtures.test.ts","src/demo/hooks.ts","src/demo/next-config.test.ts","src/demo/ops/account.test.ts","src/demo/ops/account.ts","src/demo/ops/imports.test.ts","src/demo/ops/imports.ts","src/demo/ops/review.test.ts","src/demo/ops/review.ts","src/demo/ops/uploads.test.ts","src/demo/ops/uploads.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes-coverage.test.ts","src/demo/routes.ts","src/demo/routes/account.ts","src/demo/routes/http.ts","src/demo/routes/imports.ts","src/demo/routes/read.ts","src/demo/routes/review.ts","src/demo/routes/uploads.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/lib/asset-urls.ts","src/lib/claude-types.ts","src/server/claude/cli.ts","src/server/settings.ts","vitest.demo.config.ts"]
covered_digest: "v3:sha256:263a49a1cd4b7aff3fa2ed0dc108ddd9628123aef357b3db27702775b65a2380"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open http://patrickclery.com/discogs-ai-importer/ in a normal browser and click through the whole demo (steps below)"
    expected: "Every step behaves like the real app; reloading puts everything back to the start"
    why_human: "05-09 truth is verification: backstop (non-inferable). Unit tests prove each transition in memory and CI headless Chrome proves first render, but no test clicks through the live UI end to end"
---

# Phase 5: Stubbed Demo Site Verification Report

**Phase Goal:** A demo build anyone can open and play with end to end (upload, review spines, Discogs matches, confirm and "import"), with no calls to Claude or Discogs and no real credentials; every external call replaced by canned stub data.
**Verified:** 2026-10-23T18:44:58Z
**Status:** human_needed
**Re-verification:** No (initial)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DEMO-01: `NEXT_PUBLIC_DEMO=1` gives a static export under `/discogs-ai-importer`; the default config is unchanged | ✓ VERIFIED | `next.config.ts` exports `demoConfig` only when env is exactly `1`; `next-config.test.ts` passes; CI run 40005241012 built 7 static pages |
| 2 | DEMO-02: no route handlers, server actions, proxy, SQLite, sharp or secrets in the demo output | ✓ VERIFIED | CI log `[verify-export] PASS: 392 files, rules a-h`; my grep of all 21 live JS chunks found no `better-sqlite3`, `node:fs`, `child_process`, `drizzle-orm`, `heic-decode` or server references; `/api/spines` on the live host is 404; `boundaries.test.ts` passes |
| 3 | DEMO-03: every client `/api` call is answered in the browser from memory that resets on reload | ✓ VERIFIED | `fetch-shim.ts` sends same-origin `/api/*` to `handle()`, mounted by `DemoRoot` in `layout.demo.tsx`; no XHR/EventSource anywhere in `src`; `routes-coverage.test.ts` passes; CI smoke `PASS ... zero /api requests`; `resetStore` test passes; boundaries test bans local/session storage and IndexedDB |
| 4 | DEMO-04: owner's shelf only; vision JPEG, thumb and 61 crops from the real pipeline; no HEIC, no metadata | ✓ VERIFIED | 61 crops (885,912 bytes, under the 1.65 MB budget); live `vision.jpg` is 481,377 bytes; `fixtures.test.ts` checks 1449x2576, EXIF/ICC/XMP, no HEIC and no IMG_35 strings. The only `.heic` text in the chunks is the filename label `cd-spines.heic` and the dropzone MIME map |
| 5 | DEMO-05: Discogs candidates recorded once, text only | ✓ VERIFIED | `demo/fixtures/discogs.json` covers every spine; `fixtures.test.ts` checks for no URL, thumb, uri or username; the recorder is GET-only and gated |
| 6 | DEMO-06: generated covers, not Discogs images | ✓ VERIFIED | 264 SVGs in `demo/assets/covers`; the asset-URL alias points at `demo-assets`; no `/api/discogs/thumb` or `/api/files` string in the live chunks; a live cover returns 200 |
| 7 | DEMO-07: every review status is seeded, plus the already-in-collection, failed search/import and duplicate warnings | ✓ VERIFIED | `SEED_PLAN` in `seed.ts`; the `read-model.test.ts` coverage tests pass |
| 8 | DEMO-08: upload, settings, search dialog, re-scan, retry, retry-all, change match, not on Discogs, link existing and add another all work in memory with the real transitions | ✓ VERIFIED | Fake-clock tests in `ops/{review,imports,uploads,account}.test.ts` and `settings-actions.test.ts` cover each transition; the "nothing stays in flight" test passes; `@/app/settings/actions` is aliased to the client module |
| 9 | DEMO-09: banner on every page | ✓ VERIFIED | The live upload, spines, settings and 404 HTML each contain the banner text. The root page is a client-side `NEXT_REDIRECT` to `/upload` and has no banner of its own (see the human check) |
| 10 | DEMO-10: a Pages workflow from master, source set to GitHub Actions; live | ✓ VERIFIED | `.github/workflows/demo-pages.yml` (minimal permissions, `deploy-pages@v5`); run 40005241012 succeeded at every step (tests, build, verify, smoke, deploy); all 21 live chunks return 200; github.io returns 301 to patrickclery.com; https returns 200 |
| 11 | Owner click-through of the live demo end to end, then reload resets (05-09, backstop) | ⚠️ insufficient_spec, needs human | Non-inferable truth. Abstained: presence plus unit tests do not count as a live UI click-through |

**Score:** 10/11 truths verified (0 present, behavior-unverified; 1 backstop routed to human)

### Required Artifacts

All must-have artifacts across 05-01 to 05-09 exist and are substantive and wired. Key points:
- shim → dispatcher → five route groups
- store seeded from `buildSeed`
- pages read through `useDemoSnapshot` and the read model
- two `resolveAlias` seams, demo branch only

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite | `node_modules/.bin/vitest run` | 99 files, 1753 tests passed | ✓ PASS |
| Types | `node_modules/.bin/tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `node_modules/.bin/biome check` | 634 files, no issues | ✓ PASS |
| Live pages | `curl` /, upload/, spines/, settings/, 404.html | all 200; banner in 4 of 5 (root redirects) | ✓ PASS |
| Live chunks and assets | `curl` each of 21 chunks, vision, thumb, crop, cover | all 200 | ✓ PASS |
| CI export checks and smoke | `gh run view 40005241012 --log` | verify-export PASS; smoke OK on 4 pages, zero /api | ✓ PASS |

### Probe Execution

None declared. The demo's own checks (verify-export, smoke) ran in CI, and their output is quoted above. No local demo build was run (D-20).

### Requirements Coverage

DEMO-01 to DEMO-10 are each claimed by at least one plan, and all are SATISFIED (truths 1-10). No requirement is left unclaimed.

### Anti-Patterns Found

None. No TBD, FIXME, XXX, TODO, HACK or placeholder text in the 62 changed files.

### Human Verification Required

### 1. Live demo click-through

Open http://patrickclery.com/discogs-ai-importer/ in a normal browser.

1. **Do:** Open the link. **See:** you land on the Upload page, with the grey "Demo — Claude and Discogs are simulated…" line at the top and the sample photo `cd-spines.heic` listed.
2. **Do:** Drag any photo onto the drop area. **See:** it shows as analyzing for about 3 seconds, then done.
3. **Do:** Open Spines. **See:** two copies of the shelf with spine pictures and coloured cover tiles, including CDs that are Imported, Not found, Not on Discogs and Failed.
4. **Do:** Click Add on a pending CD. **See:** it goes through waiting and importing, then shows Imported.
5. **Do:** Find the CD with the "already in your collection" warning and click Link existing copy. **See:** it becomes Imported.
6. **Do:** On the second shelf copy, click Add on a CD that the first copy already imported. **See:** a duplicate warning that shows the other spine's picture.
7. **Do:** Click Retry on a failed CD, then Retry all failed. **See:** the failed count drops to 0.
8. **Do:** Mark a CD Not on Discogs, then unmark it. **See:** its status changes each time.
9. **Do:** Open Search Discogs on a CD, type an artist, then paste a Discogs release link. **See:** results appear, and the pasted link returns a release.
10. **Do:** Open Settings. **See:** Claude CLI is ready and Discogs says Connected as demo-user. Click Disconnect. **See:** it shows not connected, and Spines says Discogs isn't connected.
11. **Do:** Reload the page. **See:** everything is back as it was at step 1 (one photo, connected).
12. **Do:** Repeat step 1 on the https:// address. **See:** the same result.

### Gaps Summary

No gaps. All ten DEMO requirements are proven by code, by the full test suite, by CI's export and smoke checks, and by read-only checks of the live site. What remains is the owner's click-through of the live UI (a backstop truth by design). Turning on "Enforce HTTPS" remains the owner's own step (D-16) and does not block the phase.

---

_Verified: 2026-10-23T18:44:58Z_
_Verifier: Claude (gsd-verifier)_
