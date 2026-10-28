---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 01
subsystem: discogs-bulk-core
status: complete
tags: [discogs, bulk-import, pressing, eligibility, zod, tdd]
requires:
  - src/server/discogs/search.ts (toYear)
  - src/server/discogs/inputs.ts (capCodePoints)
  - src/lib/discogs-types.ts, src/lib/import-types.ts, src/lib/scan-types.ts
provides:
  - choosePressing and country helpers (src/lib/pressing.ts)
  - versions path, query, parser and pressing candidate builder (src/server/discogs/versions.ts)
  - bulk constants, DTOs and BULK_START_BODY (src/lib/bulk-types.ts)
  - eligibilityOf, topMatchOf, bulkItemPhaseOf, isCurrentBulkItem (src/lib/bulk-eligibility.ts)
  - CANDIDATE_SOURCES 'pressing'
affects: [06-02, 06-03, 06-04, 06-05, 06-06, 06-07, 06-08, 06-09, 06-10, 06-11, 06-12]
tech-stack:
  added: []
  patterns: [lexicographic rank key, per-entry safeParse with whole-answer plausibility cap, pure client-safe rule module]
key-files:
  created:
    - src/lib/bulk-types.ts
    - src/lib/pressing.ts
    - src/lib/pressing.test.ts
    - src/lib/bulk-eligibility.ts
    - src/lib/bulk-eligibility.test.ts
    - src/server/discogs/versions.ts
    - src/server/discogs/versions.test.ts
    - test/fixtures/discogs/master-versions-canada.json
    - test/fixtures/discogs/master-versions-bogus.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-01-task1-red.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-01-task2-red.json
  modified:
    - src/lib/discogs-types.ts
    - src/server/discogs/client.test.ts
decisions:
  - "Pressing rank key is [official, exact country, CD, same label, year, id]; the combined-country top match joins the pool as a synthetic entry, so an exact-country version beats it and it beats a fallback (D-18, D-19, D-03)"
  - "titleMatches treats a missing version title as a mismatch against a real wanted title, so a title-less versions entry can never pass the D-21 guard"
  - "US and USA compare equal in countryMatch for both exact and combined matches"
metrics:
  duration: 8min
  completed: 2026-10-25
  tasks: 2
  files: 13
estimate:
  tokens: 70000
actuals:
  tokens: 16800
  tasks: 2
  commits: 4
plan_head_before: 2047c1d3c96394b5b96cbed7d4f8552b65f84b7d
plan_head_after: ed66491e7527ecb3c513d6b13907200431ebe321
commits: 4
---

# Phase 6 Plan 01: Pressing choice and bulk eligibility core Summary

The Canada rules now live in one pure module. `choosePressing` ranks one Discogs versions answer by official, then exact country, then CD, then the top match's label, then the earliest year. When it cannot pick a release it falls back to the top match and records why. `eligibilityOf` gives every spine one selectable or ineligible answer with a reason.

## What was built

- **src/lib/pressing.ts** (client-safe): `COUNTRY_DEMONYMS`/`COUNTRY_ALIASES`, `canonicalCountry` (which restores the Discogs spelling, because the versions filter is case-sensitive), `pressingPhrase`, `countryMatch` (exact/combined/none, D-19), `releaseTitleOf`, `titleMatches`, `needsLookup` (D-02), `choosePressing` (D-02, D-03, D-04, D-18, D-19, D-21).
- **src/server/discogs/versions.ts** (server-only): `masterVersionsPath` (accepts only positive safe ints, D-01), `versionsQuery` (one page of 100 CDs, earliest first), `VersionSchema` (capped strings, major_formats capped at 10), `parseVersions` (drops each invalid entry, and returns `'unusable'` when there are more than 1,000 items, T-06-01), `pressingCandidateValues`.
- **src/lib/bulk-types.ts**: `PRESSING_OUTCOMES`, `BULK_ITEM_STATUSES`, `BULK_SKIP_REASONS`, `LOOKUP_ERROR_KINDS`, `ELIGIBILITY_REASONS`, `BULK_MAX_ITEMS`, `BulkItemDto`, `SpineBulkDto`, `BulkRunDto`, the strict `BULK_START_BODY` (T-06-03) and `BulkStartResponse`.
- **src/lib/bulk-eligibility.ts**: `eligibilityOf` (precedence orphaned → not_on_discogs → imported → import_open → import_held → finding → skipped_duplicate → searching → no_match), `topMatchOf`, `bulkItemPhaseOf` (a queued item with a dead job reads as failed), `isCurrentBulkItem`.
- **Fixtures**: the canada fixture is a live recording of master 13814 Canadian CD versions, trimmed to 6 of 17 entries. The bogus fixture has 8,135,288 items.
- **client.test.ts**: GET `/masters/13814/versions` is allowed. POST to that path is refused before fetch is called. `isAllowed` is unchanged.

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | bec4fc2 | `tdd/06-01-task1-red.json`: RED_EVIDENCE_OK. Target "D-03: picks the earliest official DGC CD" failed on `expected 'top' to be 'version'` against the stub | 6de0b84 |
| 2 | 7020d62 | `tdd/06-01-task2-red.json`: RED_EVIDENCE_OK. Target "D-20: a failed bulk item is eligible" failed on `expected false to be true` against the stub | ed66491 |

Semantic assessment: both targets ran and failed on their planned assertions against stub modules that compiled. The RED runs used `-t` to select the target test. Vitest's tap-flat output prints multi-line `toEqual` diffs, which the classifier rejects as malformed TAP. In the unfiltered Task 1 run, 34 of 38 tests failed on assertions.

Tracer gate (auto mode): the full `<verify>` was re-run after GREEN. 112 tests passed and tsc was clean, so expansion continued.

## Verification

`vitest run src/lib src/server/discogs` gives 28 files and 692 tests passing. `tsc --noEmit` and `biome check` (646 files) are clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Missing version title never passes the title guard**
- **Found during:** Task 1
- **Issue:** The plan's "either normalized string contains the other" rule lets an empty version title pass, because `''` is contained in every string. A versions entry with no title would then skip the D-21 guard.
- **Fix:** `titleMatches(null | '', wanted)` returns false when the normalized wanted title is non-empty. An empty wanted title still matches anything.
- **Files modified:** src/lib/pressing.ts
- **Commit:** 6de0b84

**2. [Rule 2 - Correctness] An empty thumb string maps to null**
- **Found during:** Task 1
- **Issue:** Discogs can answer `"thumb": ""`. Storing that would mark a cover that does not exist.
- **Fix:** `parseVersions` maps a blank thumb to null.
- **Files modified:** src/server/discogs/versions.ts
- **Commit:** 6de0b84

**3. [Fixture] Two live entries edited**
- The live answer had no Box Set and no Unofficial Release entry. Following the plan's instruction, 3326731 was given `major_formats: ["Box Set"]` and 1112994 was given `format: "Album, Unofficial Release"` with released `"1991"`. Both edits are recorded in the fixture's `_note`.

## Known Stubs

None. The RED stubs were replaced in the GREEN commits.

## Self-Check: PASSED

- All 9 created source, test and fixture files exist.
- Commits bec4fc2, 6de0b84, 7020d62 and ed66491 are ancestors of HEAD.
