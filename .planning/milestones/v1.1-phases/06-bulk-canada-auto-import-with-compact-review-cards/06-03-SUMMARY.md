---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 03
subsystem: settings
status: complete
tags: [settings, preferred-country, demo, server-action, tdd]
requires:
  - src/lib/pressing.ts (canonicalCountry, from 06-01)
  - src/server/settings.ts (getSetting/setSetting)
provides:
  - getPreferredCountry, setPreferredCountry, DEFAULT_PREFERRED_COUNTRY, PREFERRED_COUNTRY_KEY, PreferredCountrySchema (src/server/settings.ts)
  - savePreferredCountry (src/app/settings/actions.ts and the demo twin src/demo/settings-actions.ts)
  - DemoAccount.preferredCountry (seeded Canada)
  - PreferredCountryField, countrySaveDecision, countrySaveErrorText (src/components/preferred-country-field.tsx)
  - DiscogsCard prop preferredCountry
affects: [06-04, 06-05, 06-06, 06-07, 06-08, 06-09, 06-10, 06-11, 06-12]
tech-stack:
  added: []
  patterns: [save-on-blur text field with in-flight guard, SQLite trigger to simulate a real storage failure in tests]
key-files:
  created:
    - src/components/preferred-country-field.tsx
    - src/components/preferred-country-field.test.ts
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-03-task1-red.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-03-task2-red.json
  modified:
    - src/server/settings.ts
    - src/server/settings.test.ts
    - src/app/settings/actions.ts
    - src/app/settings/actions.test.ts
    - src/demo/settings-actions.ts
    - src/demo/settings-actions.test.ts
    - src/demo/store.ts
    - src/demo/seed.ts
    - src/components/discogs-card.tsx
    - src/app/settings/page.tsx
    - src/app/settings/page.demo.tsx
key-decisions:
  - "savePreferredCountry answers 'a country name is at most 40 characters' for an over-long value (real and demo) instead of passing zod's JSON message through"
  - "The field guards Enter-then-blur with an in-flight ref so one edit saves once"
requirements-completed: [BULK-09]
metrics:
  duration: 4min
  completed: 2026-10-25
  tasks: 2
  files: 15
estimate:
  tokens: 60000
actuals:
  tokens: 8200
  tasks: 2
  commits: 4
plan_head_before: 71e9b36641ac8e9407c10fa59275cd5b6f4fe632
plan_head_after: e17207cf247408e91845495228c110ba8bb57334
commits: 4
coverage:
  - deliverable: "Preferred country stored in the settings table, default Canada, Discogs spelling"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/settings.test.ts#preferred country"
        status: pass
  - deliverable: "savePreferredCountry real action and demo twin with identical answers"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/app/settings/actions.test.ts#savePreferredCountry"
        status: pass
      - kind: test
        ref: "src/demo/settings-actions.test.ts#saves the preferred country in Discogs spelling, like the real action"
        status: pass
  - deliverable: "Preferred country field on the Settings Discogs card (app and demo)"
    human_judgment: true
    rationale: "Helpers and server markup are tested; focus, blur, Enter/Escape, spinner and toast need a real browser (plan human-check)"
    verification:
      - kind: test
        ref: "src/components/preferred-country-field.test.ts"
        status: pass
---

# Phase 6 Plan 03: Preferred country setting Summary

The preferred country (D-14) now lives in the settings table as `preferred_country`, defaults to Canada, and is always stored in Discogs' spelling (`canada` saves `Canada`), because the versions filter is case-sensitive. The owner edits it on the Settings Discogs card under the collection folder, in the app and in the demo.

## What was built

- **src/server/settings.ts**: `PREFERRED_COUNTRY_KEY`, `DEFAULT_PREFERRED_COUNTRY`, `PreferredCountrySchema` (trim, 1-40), `getPreferredCountry()` (falls back to Canada for a missing or invalid row), `setPreferredCountry()` (parses, canonicalizes with `canonicalCountry`, stores, returns the stored value).
- **savePreferredCountry** (real action): blank returns `enter a country`. Over 40 characters returns `a country name is at most 40 characters`. A storage failure returns the bare reason with its trailing period removed, cut to 160. Success revalidates `/settings` and returns `{ ok: true, country }`.
- **Demo twin**: the same answers after `SETTINGS_DELAY_MS`. It writes only `getState().account.preferredCountry` and then calls `emit()`. `defaultAccount()` seeds `'Canada'`. The drop-in key list now includes `savePreferredCountry`.
- **PreferredCountryField**: the label, input (`w-64 max-w-full`, maxLength 40, no autocomplete or spellcheck) and description follow the UI-SPEC. The field saves on blur and on Enter, but only when the trimmed value changed. Escape restores the saved value. A 16px Spinner shows while a save is pending. On success it shows the canonical value and the toast `Preferred country set to {country}`. An empty value shows `Enter a country, such as Canada.` A failed save shows `Not saved: {reason}. Leave the field again to retry.` and keeps the typed value.
- **DiscogsCard**: a required `preferredCountry` prop is threaded through AccountSection to ConnectedSection. The field renders right after CollectionFolderField, and only when connected. `/settings` passes `getPreferredCountry()`. The demo page passes `account.preferredCountry` from its `select()`.

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | 9d4d261 | `tdd/06-03-task1-red.json`: RED_EVIDENCE_OK. Target "setPreferredCountry('canada') stores and returns Canada" failed on `expected 'canada' to be 'Canada'` against the stub | 34acf24 |
| 2 | c786302 | `tdd/06-03-task2-red.json`: RED_EVIDENCE_OK. Target "countrySaveErrorText > wraps the bare reason in the UI-SPEC sentence" failed on its toBe assertion against the stub | e17207c |

Semantic assessment: both targets ran and failed on their planned assertions. The stubs compiled and loaded. In the unfiltered RED runs, Task 1 failed 10 new tests and Task 2 failed 8 of 11.

Tracer gate (auto mode): the full Task 1 `<verify>` was re-run after GREEN. 53 tests passed and tsc was clean, so expansion continued.

## Verification

- `vitest run src/server/settings.test.ts src/app/settings src/demo src/components/preferred-country-field.test.ts`: all passed. `tsc --noEmit`: exit 0. `biome check`: clean (653 files).
- Full suite: 1935 of 1936 passed. The one failure was `cli.test.ts > times out a sleeping child in under 4 s`, a timing test under load. It passes in isolation (41/41) and belongs to the same known-flaky family.
- All acceptance greps pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Readable reason for an over-long country**
- **Found during:** Task 1 GREEN
- **Issue:** Passing a 41-character value through `setPreferredCountry` threw a zod error. Its message is a JSON array, so the field would have shown `Not saved: [ { "origin": ...`.
- **Fix:** Both the real and demo `savePreferredCountry` now check the length first and answer `a country name is at most 40 characters`. The input's maxLength of 40 already stops this in the UI.
- **Files modified:** src/app/settings/actions.ts, src/demo/settings-actions.ts, and both tests
- **Commit:** 34acf24

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** this is copy only. The plan's behaviour is unchanged.

## Known Stubs

None.

## Human check (end of phase)

Run the app on port 3001 and open `/settings` while connected. Type `canada` in Preferred country and click elsewhere: the field shows Canada and a toast says "Preferred country set to Canada". Clear the field and click elsewhere: "Enter a country, such as Canada." appears and nothing is saved.

## Self-Check: PASSED

- All created files exist on disk. Commits 9d4d261, 34acf24, c786302 and e17207c are on HEAD.

Ready for 06-04.
