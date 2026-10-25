---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
reviewed: 2026-10-25T23:45:00Z
depth: standard
iteration: 3
scope: incremental (gap closure 06-13..06-18, diff since f4ab36b)
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
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 6: Code Review Report (incremental, gap closure 06-13..06-18)

**Reviewed:** 2026-10-25T23:45:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

This review covers only the changes since `f4ab36b`, which close G-06-side-1 (the Fallback country tier and its setting) and G-06-9 (status tabs that wrap).

- **Fallback country.** The pure logic in `src/lib/pressing.ts` is consistent. `needsFallbackLookup` fires under exactly the conditions where `choosePressing` reaches `chooseFallbackTier`, and `distinctFallback` is the one place that decides whether a second tier exists. The route, the demo `startBulk`, `bulk-copy` and the dialog all call it.
- **Run snapshot.** `bulk_runs.fallback_country` is snapshotted in the run, so Retry is unaffected by later Settings edits. Runs from before migration 0005 read as null, which means no second tier.
- **Demo twin.** The demo matches the real ordering: preferred, then an exact fallback-country top match, then an exact fallback version, then a combined top match, then the top match.
- **Status tabs.** `w-fit` plus `flex-wrap` on the ToggleGroup bounds the row to the container, so it wraps correctly.
- **Checks.** Targeted Vitest suites pass (225 tests) and `tsc --noEmit` is clean.

The one robustness issue: the optional second lookup can fail an item that already has a usable answer.

## Warnings

### WR-01: A failed fallback-country lookup fails the whole item, even though the preferred answer was already usable

**File:** `src/server/jobs/handlers/resolve-pressing.ts:337-339` (error mapping at `:286-300`)
**Issue:**
- The second `GET /masters/{id}/versions?country=<fallback>` goes through the same `lookupVersions` error mapping as the first request.
- `DiscogsRequestError` and `DiscogsVersionsShapeError` fail the item as `rejected` and the caller returns. A persistent `DiscogsUnavailableError` (5xx) is rethrown until attempts run out, and then the item fails.
- By that point the preferred-country answer has already arrived and is usable. Without the fallback tier, the item would have been imported as its top match with `fallback_no_version`.
- So the fallback tier, which is optional, turns a spine that would have imported into a failed one. Each retry also re-sends the preferred request, which spends Discogs quota.
- The header comment ("Each request's failures, the same for both") documents this, but it is a regression compared with the behaviour before 06-16.

**Fix:** Degrade the second request instead of failing on it. Keep the auth (401) and rate-limit/NotCurrent paths, but map deterministic or unavailable errors to "no fallback answer":
```ts
const second = await lookupVersions(masterId, fallback, { optional: true });
// inside lookupVersions, when optional:
//   DiscogsRequestError | DiscogsVersionsShapeError -> return { failed: false, versions: undefined }
//   DiscogsUnavailableError (last attempt) -> same, instead of rethrowing
```
`chooseFallbackTier` already maps `fallbackVersions === undefined` to `keep('fallback_no_version')`, so the item imports its top match exactly as it did before the fallback tier existed.

## Info

### IN-01: Fallback-tier title-guard failure reuses the "no usable master" copy

**File:** `src/lib/pressing.ts:304`, `src/lib/bulk-copy.ts:200-202`
**Issue:**
- Suppose the preferred tier is empty and the best fallback-country version fails the D-21 title guard. The outcome is then `fallback_unusable_master`.
- The card then reads "No Canadian pressing listed for this release, used X". That hides that the fallback country was tried, unlike `fallback_no_version`, which names both countries through `soughtPhrase`.

**Fix:** Either use `soughtPhrase(item)` in the `fallback_unusable_master` line when `item.fallbackCountry` is set, or return a distinct outcome from the fallback-tier guard branch.

### IN-02: No hint when the Fallback country equals the Preferred country

**File:** `src/components/preferred-country-field.tsx:174-193`
**Issue:**
- If the owner saves Fallback = Preferred (for example, both US), `distinctFallback` silently disables the second tier.
- The run copy and the dialog stay correct, but the Settings field says nothing, so the owner may think a second tier is active.

**Fix:** Pass the preferred country into `FallbackCountryField`. When `countryMatch(fallback, preferred) === 'exact'`, show a FieldDescription note such as "Same as the preferred country, so bulk import goes straight to the top match."

---

_Reviewed: 2026-10-25T23:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
