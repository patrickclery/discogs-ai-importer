---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 16
subsystem: bulk-import
tags: [bulk, fallback-country, discogs, migration, gap-closure, tdd]
status: complete

requires:
  - phase: 06-13
    provides: "distinctFallback, needsFallbackLookup, choosePressing fallback tier"
  - phase: 06-14
    provides: "getFallbackCountry (default 'US')"
provides:
  - "bulk_runs.fallback_country (migration 0005), snapshotted at run start"
  - "startBulkRun({ fallbackCountry? }) defaulting to null; BulkRunDbRow.fallback_country"
  - "resolve_pressing: one shared lookupVersions helper; second GET for the fallback country only when needsFallbackLookup"
  - "fake Discogs master 51011 lists a US version (801011); live proof of the fallback tier"
affects: [06-17, 06-18]

actuals:
  tokens: 21300
  tasks: 3
  commits: 4
plan_head_before: 7684c2498a424e76c8b9c1376f9f2b75a4d0911d
plan_head_after: 7218d08ef7a8f3f1ec0b911ea5ba8e33b190bec6

tech-stack:
  added: []
  patterns:
    - "Nested lookupVersions(masterId, country) helper owns the isCurrent check, paused-gate deferral, discogsFetch call and error mapping for both versions requests (single discogsFetch call site)"

key-files:
  created:
    - drizzle/0005_bulk_fallback_country.sql
    - drizzle/meta/0005_snapshot.json
  modified:
    - drizzle/meta/_journal.json
    - src/server/db/schema.ts
    - src/server/db/migrations.test.ts
    - src/server/bulk/store.ts
    - src/server/bulk/store.test.ts
    - src/app/api/spines/bulk-import/route.ts
    - src/app/api/spines/bulk-import/route.test.ts
    - src/server/jobs/handlers/resolve-pressing.ts
    - src/server/jobs/handlers/resolve-pressing.test.ts
    - test/fixtures/fake-discogs.mjs
    - scripts/verify-bulk-import.ts

key-decisions:
  - "A second versions GET (D-01 shape, fallback country) instead of reusing the Canada answer: the Canada request is country-filtered, so it holds no US versions"
  - "The fallback country is snapshotted on bulk_runs like the preferred country and folder, so a Settings change never alters a running run or its Retry"

metrics:
  duration: 6min
  completed: 2026-10-25
---

# Phase 6 Plan 16: Fallback-Country Lookup in Bulk Import Summary

Bulk runs now snapshot the fallback country (migration 0005, default US). When a master has no Canadian CD, resolve_pressing sends one more `/masters/{id}/versions` GET for the US and imports the US CD pressing with outcome `fallback_country`. The top match is kept only when no usable US version exists.

## What was built

- **Migration 0005:** drizzle-kit generated a single `ALTER TABLE bulk_runs ADD fallback_country text`. Older runs read null.
- **Run snapshot:** the route calls `startBulkRun` with `fallbackCountry: distinctFallback(preferred, getFallbackCountry())`. The default stores `'US'`. A fallback equal to the preferred country stores null.
- **Job:** the request and its error switch moved into one nested `lookupVersions` helper. The sign-in checks still run once. The second call happens only when `needsFallbackLookup` is true, and `choosePressing` gets `fallback` and `fallbackVersions`. The transaction is unchanged.
- **Live proof:** fake master 51011 lists UK plus US (801011). `verify-bulk-import` asserts:
  - the item resolves to 801011 with outcome `fallback_country`
  - there are picks + 1 versions requests (exactly one US request, for 51011, after its Canada request)
  - the run has `fallback_country` 'US'

## Verification

- `npx vitest run`: 121 files, 2265 tests passed
- `npx tsc --noEmit`: 0 errors
- `biome check`: clean
- `node scripts/verify-bulk-import.ts`: all steps passed on an ephemeral port with temp data. Output: "6 versions requests (one country Canada per looked-up spine plus one country US for /masters/51011/versions); fallback_country US"
- Tracer gate: Task 1's automated verify was re-run green before expansion

## TDD Notes

- Task 1: RED commit `706afb7` (6 failing tests), then GREEN `cc99d2e`.
- Task 2: the behavior tests passed on first run, because Task 1's shared helper already delivered the behavior. To check that the tests really catch a regression, I forced the second request to go out whenever the first answer was usable, and 2 tests failed. The tests were committed as `9e864cf` (test-only).

## Deviations from Plan

- **[Rule 1 - Bug] The migration 0004 test counted 5 applied migrations.** It now expects 6, since 0005 exists. Found in Task 1. File: `src/server/db/migrations.test.ts`. Commit: `cc99d2e`.
- Request count: the plan itself sends a second request, against the orchestrator's note asking for no extra request. That was the planned design and was implemented as written.

## Known Stubs

None.

## Commits

- 706afb7 test(06-16): add failing tests for the fallback-country run snapshot and US lookup
- cc99d2e feat(06-16): bulk runs snapshot the fallback country and look up its CD pressing
- 9e864cf test(06-16): the fallback lookup is sent only when it can help and fails like the first
- 7218d08 test(06-16): live-stack proof imports the no-Canadian release as its US CD

## Self-Check: PASSED
