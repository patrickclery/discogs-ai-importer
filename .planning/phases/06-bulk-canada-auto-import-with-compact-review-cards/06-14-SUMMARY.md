---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 14
subsystem: settings
tags: [settings, fallback-country, demo, gap-closure, tdd]
status: complete

requires:
  - phase: 06-03
    provides: "Preferred country setting, savePreferredCountry, PreferredCountryField, demo twin rule"
  - phase: 06-13
    provides: "distinctFallback / fallback tier in choosePressing (consumer of this value)"
provides:
  - "getFallbackCountry / setFallbackCountry, FALLBACK_COUNTRY_KEY ('fallback_country'), DEFAULT_FALLBACK_COUNTRY ('US')"
  - "saveFallbackCountry server action and demo twin"
  - "FallbackCountryField on the Settings Discogs card (app and demo)"
  - "COUNTRY_EMPTY_COPY constant for both country fields"
affects: [06-16, 06-17]

actuals:
  tokens: 7300
  tasks: 2
  commits: 4
plan_head_before: a119bf32c63d3844783caf15fd088112687a00d7
plan_head_after: e8d75264f0c358db287f9e27937b67f425e2a36e

tech-stack:
  added: []
  patterns:
    - "One unexported saveCountry(country, setter) helper behind both 'use server' country actions"
    - "One unexported CountrySettingField behind PreferredCountryField and FallbackCountryField"

key-files:
  created: []
  modified:
    - src/server/settings.ts
    - src/server/settings.test.ts
    - src/app/settings/actions.ts
    - src/app/settings/actions.test.ts
    - src/demo/settings-actions.ts
    - src/demo/settings-actions.test.ts
    - src/demo/store.ts
    - src/demo/seed.ts
    - src/components/preferred-country-field.tsx
    - src/components/preferred-country-field.test.ts
    - src/components/discogs-card.tsx
    - src/app/settings/page.tsx
    - src/app/settings/page.demo.tsx

key-decisions:
  - "Fallback country reuses PreferredCountrySchema and canonicalCountry; no cross-field check, so it may equal the preferred country (no second tier)"
  - "Empty copy exported as COUNTRY_EMPTY_COPY so the per-field copy is testable without a browser"

metrics:
  duration: 4min
  completed: 2026-10-25
---

# Phase 6 Plan 14: Fallback Country Setting Summary

The Settings Discogs card now has a Fallback country field (default US) right after Preferred country. It saves Discogs' spelling under its own `fallback_country` key, with the same validation, spinner, errors and toast as Preferred country, and has a demo twin.

## What was built

- **settings.ts:** `getFallbackCountry` (stored value or `US`) and `setFallbackCountry` (trim, max 40, canonicalized, stored). It mirrors the preferred-country block.
- **actions.ts:** `saveFallbackCountry`. Both country actions go through one unexported `saveCountry(country, setter)` helper, so their answers are identical: `enter a country`, `a country name is at most 40 characters`, or a bare storage reason (trailing period removed, cut to 160). Each revalidates `/settings`.
- **Demo:** `DemoAccount.fallbackCountry` is seeded as `US`. The demo `saveFallbackCountry` shares a helper with `savePreferredCountry` and writes only its own field before calling emit. The demo module still exports exactly the real module's names.
- **preferred-country-field.tsx:** the field body moved into `CountrySettingField`. `PreferredCountryField` keeps its ids, copy and toast unchanged. `FallbackCountryField` uses the ids `fallback-country` / `fallback-country-error`, the plan's description, the empty copy "Enter a country, such as US." and the toast `Fallback country set to {country}`.
- **discogs-card.tsx / pages:** `fallbackCountry` is passed down through DiscogsCard, AccountSection and ConnectedSection. The real page reads `getFallbackCountry()` and the demo page reads `account.fallbackCountry`.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 08b60c4 | test(06-14): add failing tests for the fallback country setting |
| 1 GREEN | 8781ff2 | feat(06-14): fallback country setting with a demo twin |
| 2 RED | 455a18d | test(06-14): add failing tests for the Fallback country field |
| 2 GREEN | e8d7526 | feat(06-14): Fallback country field on the Settings Discogs card |

## TDD Gate Compliance

- Task 1 RED: 11 target tests failed (`getFallbackCountry with no stored row returns US` failed with "expected undefined to be 'US'"). The classifier returned `RED_EVIDENCE_OK`. Semantic check: the failures came from the missing exports, and the 53 existing tests passed.
- Task 2 RED: 5 target tests failed (`DiscogsCard country fields > shows Preferred country before Fallback country when connected` failed with "expected -1 to be greater than 4187"). The classifier returned `RED_EVIDENCE_OK`. Semantic check: the card rendered and no fallback input was present. The first draft rendered the field when the test file loaded, which is an invalid RED. It was moved inside each test before committing.
- Tracer gate (Task 1, auto mode): the verify step was re-run and passed (64/64, tsc 0) before Task 2 started.

## Verification

- `npx vitest run`: 2238/2238 passed (120 files). `npx tsc --noEmit`: 0 errors. `biome check`: clean (686 files).
- Acceptance greps: `getFallbackCountry` = 1, `saveFallbackCountry` = 1 in both the real and demo actions, `fallbackCountry: 'US'` = 1 in seed.ts, `FallbackCountryField` appears in the card's import and render, `font-(semibold|bold)` = 0.
- Human check (blur, toast and empty copy in a real browser) is deferred to the end-of-phase UAT (`human_verify_mode: end-of-phase`).

## Deviations from Plan

**1. [Rule 2 - Testability] Exported COUNTRY_EMPTY_COPY**
- **Found during:** Task 2
- **Issue:** The empty copy appears only after a blur. A server-rendered markup test cannot reach it.
- **Fix:** Both empty-copy strings live in one exported constant, and a test checks both. The field behavior is unchanged.
- **Files modified:** src/components/preferred-country-field.tsx, src/components/preferred-country-field.test.ts
- **Commit:** 455a18d / e8d7526

**2. [Rule 3 - Blocking] Stubbed the Discogs card's other children in the field test**
- **Found during:** Task 2
- **Issue:** The card-order behavior needs DiscogsCard rendered, and its other children need a router, a query client or the server.
- **Fix:** `vi.mock` stubs in preferred-country-field.test.ts, so only the two country fields render.
- **Commit:** 455a18d

## Known Stubs

None.

## Threat Flags

None. The fallback value goes through the same zod schema as the preferred country (T-06-28) and the existing server-action Origin guard (T-06-29).

## Self-Check: PASSED

- All 13 modified files exist. Commits 08b60c4, 8781ff2, 455a18d and e8d7526 are ancestors of HEAD.
