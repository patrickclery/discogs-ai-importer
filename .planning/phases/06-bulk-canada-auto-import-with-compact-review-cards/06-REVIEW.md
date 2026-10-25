---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
reviewed: 2026-10-25T23:56:52Z
depth: standard
iteration: 5
scope: re-review of fixes 9cde7b6, 5bb5a4a (new outcomes fallback_country_unusable, fallback_country_unchecked) and every consumer of the outcome union (diff since f4ab36b)
files_reviewed: 26
files_reviewed_list:
  - drizzle/0005_bulk_fallback_country.sql
  - scripts/verify-bulk-import.ts
  - src/app/api/spines/bulk-import/route.ts
  - src/app/settings/actions.ts
  - src/app/settings/page.demo.tsx
  - src/app/settings/page.tsx
  - src/components/bulk-import-bar.tsx
  - src/components/bulk-import-dialog.tsx
  - src/components/discogs-card.tsx
  - src/components/preferred-country-field.tsx
  - src/components/review-status-filter.tsx
  - src/demo/ops/bulk.ts
  - src/demo/read-model.ts
  - src/demo/seed.ts
  - src/demo/settings-actions.ts
  - src/demo/store.ts
  - src/lib/bulk-copy.ts
  - src/lib/bulk-types.ts
  - src/lib/pressing.ts
  - src/lib/scan-types.ts
  - src/server/bulk/queries.ts
  - src/server/bulk/store.ts
  - src/server/db/schema.ts
  - src/server/jobs/handlers/resolve-pressing.ts
  - src/server/scan/queries.ts
  - src/server/settings.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 6: Code Review Report (re-review of the WR-01 and IN-01 fixes)

**Reviewed:** 2026-10-25T23:56:52Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** clean

## Summary

This re-review checks the two fixes in 06-REVIEW-FIX.md (iteration 2) and every consumer of `PressingOutcome`.

- **WR-01 (9cde7b6): correct.**
  - The preferred tier's `'unusable'` answer and its guard miss (`pressing.ts:367`, `:374`) still return `fallback_unusable_master`. `needsFallbackLookup` is false for both, so the copy now names only the preferred country (`bulk-copy.ts:207-208`). That is true.
  - The fallback tier's `'unusable'` answer and its guard miss (`pressing.ts:302-304`, `:312-313`) return `fallback_country_unusable`, and its line uses the pair phrase. Both countries really were tried.
- **IN-01 (5bb5a4a): correct.**
  - Each optional-request degrade branch returns `UNCHECKED`: a non-404 4xx, a wrong-shaped body, and a last-attempt 5xx or unknown error (`resolve-pressing.ts:314`, `:320`, `:332`). The call site maps that to `'failed'` (`:375`).
  - A fallback 404 comes back as `versions: undefined` without `unchecked`. The call site turns it into `[]`, so `rankTier` sees an examined empty answer. The outcome is `fallback_no_version`, or `fallback_country` when the top match names the fallback country in a combined country. Both are correct.
  - `parseVersions` never returns `undefined` (`versions.ts:88`), so `?? []` only applies to the 404.
  - `chooseFallbackTier` gives `fallback_country_unchecked` for `undefined` and for `'failed'`. The `keep` wrapper still promotes a combined top match to `fallback_country`.
  - In the job, `undefined` cannot reach the fallback tier. When `distinctFallback` is non-null, the preferred answer is an array whose tier is empty, and the top match is not exactly from the fallback country, `needsFallbackLookup` is true, so the second request is always sent. Both paths use the same `distinctFallback`.
  - Auth, 429, the paused gate and a lost current run behave the same as before.
- **Consumers of the outcome union: consistent.**
  - The only place that reads the outcome is `fallbackLine`, and it has a case for both new outcomes.
  - The Fallback filter (`isFallbackSpine`, used by `scan/queries.ts:382,393` and `demo/read-model.ts:719,735`) reads the release country, not the outcome. So do the Fallback badge (`countryBadgeOf`, used by `country-badge.tsx` and `confirmed-match.tsx`), `summarizeRun` with its `fallbacks` toast count, and the fallback line gate (`bulk-copy.ts:305`).
  - Both new outcomes keep the top match, whose country is `'none'` against the preferred country on this path. So they always count as fallbacks, show the badge, and reach `fallbackLine`, the same as `fallback_no_version`.
  - The review-status mapping uses `lookupOf` (item phase only), so it is not affected.
  - `bulk/queries.ts:159` passes `outcome` through without narrowing, so there is no stale whitelist. The schema enum reads `PRESSING_OUTCOMES`, and `0004_bulk_import.sql:7` is a plain `text` with no CHECK, so no migration is needed.
  - The demo twin's `fallbackTier` (`demo/ops/bulk.ts:160-180`) never produces either new outcome, and the doc comment says so. Its run snapshots the fallback country through `distinctFallback` (`:328`).
  - `verify-bulk-import.ts:219-224` expects only `preferred` and `fallback_country`, which the fake's always-answering fixture still produces.
- **Copy:** the unchecked line reads `No Canadian pressing, couldn't check for US pressings, used X`. A country without a demonym reads `pressings from {country}`. The `second === null` branch cannot be reached from the job, but it is still a true line.

Checks: the targeted Vitest suites (pressing, bulk-copy, bulk-view, resolve-pressing, demo) pass (22 files, 440 tests), and `tsc --noEmit` is clean.

## Info

### IN-01: `fallbackLine` has no exhaustiveness guard, so a future outcome would silently get the generic line

**File:** `src/lib/bulk-copy.ts:222-223`
**Issue:** The switch ends in a `default` that returns `No {phrase}, {used}`. This fix had to add two cases by hand. If a later outcome is added to `PRESSING_OUTCOMES` without a case here, `tsc` will not catch it, and the card will show the generic line, which can be wrong (the same kind of problem as WR-01).
**Fix:** List the remaining outcomes (`preferred`, `null`) explicitly and make the default unreachable:
```ts
    case 'preferred':
    case null:
      return `No ${phrase}, ${used}`;
    default: {
      const _exhaustive: never = item.outcome;
      return `No ${phrase}, ${used}`;
    }
```

---

_Reviewed: 2026-10-25T23:56:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
