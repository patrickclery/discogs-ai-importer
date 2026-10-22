---
phase: 04-import-review-queue
plan: 06
subsystem: ui
tags: [discogs, settings, folders, nextjs, zod, sqlite]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 folder getters (getCollectionFolderId, getCachedFolders, collectionFolderName), FoldersResponseSchema, foldersPath, imports recording folder_id"
provides:
  - "refreshFolders(), setCollectionFolderId(), folderState() in src/server/discogs/folders.ts"
  - "GET /api/discogs/folders (cache only) and POST { refresh: true } (one gated read)"
  - "saveCollectionFolder() server action"
  - "CollectionFolderField in the connected Settings Discogs card, with every E12 state"
  - "Not-connected Settings copy now says a release is added only on Add"
affects: [04-05, 04-10, 04-13]

actuals:
  tokens: 9700
  tasks: 2
  commits: 3
plan_head_before: aa32861c6296cd7865bfb668ee2f177b3d78c432
plan_head_after: a60783be0e6eaef0060d5f0720d83a014f984c3e

tech-stack:
  added: []
  patterns:
    - "Inline gated Discogs read from a route (Test-connection precedent) with a settings-table cache and a 1-hour client staleness rule"
    - "Save-on-change Select with revert, reason wrapped client-side in the UI-SPEC sentence"

key-files:
  created:
    - src/app/api/discogs/folders/route.ts
    - src/app/api/discogs/folders/route.test.ts
    - src/components/collection-folder-field.tsx
    - src/server/discogs/folders.test.ts
  modified:
    - src/server/discogs/folders.ts
    - src/app/settings/actions.ts
    - src/app/settings/actions.test.ts
    - src/components/discogs-card.tsx

key-decisions:
  - "setCollectionFolderId refuses any id when no folder list is cached, even 1; the field always has a list (or is loading) before a save is possible"
  - "A folder list Discogs answers in the wrong shape is a DiscogsRequestError('Discogs answered without a folder list'), so the route can show that reason safely"
  - "A refresh 403 (DiscogsRequestError status 403) maps to rejected, like a 401"
  - "saveCollectionFolder returns the bare reason; the field wraps it as 'Not saved: {reason}. Pick the folder again to retry.'"
  - "A successful folder save invalidates ['spines'] and dispatches app:status-refresh so Add labels pick up the new folder"

patterns-established:
  - "Folder state DTO (folders, selectedId, savedId, savedMissing, fetchedAt) is computed server-side from the settings table only"

requirements-completed: [IMP-02]

coverage:
  - id: D1
    description: "POST /api/discogs/folders refresh reads the folders once through the gate with oauth, drops folder 0, keeps Discogs order and caches them; GET answers the cache without calling Discogs"
    requirement: IMP-02
    verification:
      - kind: unit
        ref: "src/app/api/discogs/folders/route.test.ts#a refresh reads the folders once, drops folder 0 and keeps Discogs order"
        status: pass
      - kind: unit
        ref: "src/app/api/discogs/folders/route.test.ts#GET answers the cached list, the saved folder and connected"
        status: pass
    human_judgment: false
  - id: D2
    description: "Refresh refusals: 415, 400, 409 not_connected, busy while paused, rejected on 401/403, unreachable, busy on 429, other with a 160-char reason that never names the user or echoes Discogs"
    requirement: IMP-02
    verification:
      - kind: unit
        ref: "src/app/api/discogs/folders/route.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Folder rules: nothing saved gives 1; a saved folder missing from a fresh list falls back to 1 and reads savedMissing; only an integer of at least 1 in the cached list can be saved"
    requirement: IMP-02
    verification:
      - kind: unit
        ref: "src/server/discogs/folders.test.ts"
        status: pass
      - kind: unit
        ref: "src/app/settings/actions.test.ts#saveCollectionFolder"
        status: pass
    human_judgment: false
  - id: D4
    description: "Imports still go to folder 1 by default end to end"
    requirement: IMP-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Settings Collection folder field: real folders listed with counts, save toast, spinning refresh, loading, load-failure, save-failure and missing-folder lines; Add buttons follow the chosen folder"
    requirement: IMP-02
    verification: []
    human_judgment: true
    rationale: "Visual states and the real account's folders need a person; automated checks use the fake Discogs and no DOM test harness exists"

duration: 7min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 06: Collection folder setting Summary

**The Settings Discogs card now has a Collection folder select. It is fed by one gated, cached read of the owner's Discogs folders (folder 0 dropped, Discogs order kept) and saves on change through a validated action, so new imports go to the chosen folder and fall back to Uncategorized when that folder disappears.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-22T09:17:52Z
- **Completed:** 2026-10-22T09:24:24Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `refreshFolders()`, `setCollectionFolderId()` and `folderState()` sit next to the 04-01 getters. The signatures of `getCollectionFolderId()` and `collectionFolderName()` are unchanged, which 04-05 and 04-10 rely on.
- `GET /api/discogs/folders` answers from the cache only. `POST { refresh: true }` runs the inline gated read and answers `ok`/`kind`/`reason`, never Discogs' response body.
- `saveCollectionFolder(id)` accepts only an integer of at least 1 that is in the cached list.
- `CollectionFolderField` covers every UI-SPEC E12 state: Loading folders…, a spinning refresh, a load failure with Try again, a save failure that reverts, and the missing-folder warning.
- The not-connected copy now reads "The app adds a release to your Discogs collection only when you click Add on a match." (A-04-14).

## Task Commits

1. **Task 1: Tracer, from folder list to the chosen folder on import** - `62b09c0` (feat)
2. **Task 2: Folder edge cases** - `21b4b6b` (test), `a60783b` (feat)

## Files Created/Modified
- `src/server/discogs/folders.ts`: refresh, setter and state DTO
- `src/app/api/discogs/folders/route.ts` and `route.test.ts`: GET cache and POST refresh, with 11 tests
- `src/app/settings/actions.ts` and `actions.test.ts`: `saveCollectionFolder` and its tests
- `src/server/discogs/folders.test.ts`: tests for the folder rules
- `src/components/collection-folder-field.tsx`: the field
- `src/components/discogs-card.tsx`: field placement and the new not-connected copy

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

None. Rules 1-3 were not needed.

## TDD Gate Compliance

- **RED (`21b4b6b`): unexpected GREEN.** Every `<behavior>` case passed when first run. Investigation found the cause: Task 1's action told the tracer to implement `setCollectionFolderId` (int at least 1, present in the cache) and `folderState().savedMissing`, and Plan 04-01 had already shipped `getCollectionFolderId` and `collectionFolderName`. The tests are not vacuous. A temporary mutation removing the cache-membership checks made 4 cases fail (an uncached id refused by the action and by the setter, no cache refuses 1, savedMissing). The file was then restored byte-for-byte. Semantic assessment: the tests characterise behaviour the plan's order already delivered, so this was not a true RED.
- **GREEN (`a60783b`):** the remaining Task 2 work, which is UI states in `CollectionFolderField`. No unit harness exists for it, so it is covered by the human check.
- **REFACTOR:** none needed.

## Issues Encountered
- `corepack pnpm lint` exits 1, but only on `tsconfig.json` formatting. That file had uncommitted changes before this plan started (the orchestrator's `.next/gsd-gate` includes) and is out of scope. Biome on every file this plan touched passes, and the committed `tsconfig.json` is unchanged.

## Verification
- `corepack pnpm typecheck`: passes
- `corepack pnpm test`: 66 files, 1007 tests pass
- Biome on the changed files: clean
- `node scripts/verify-discogs-import.ts`: "verify-discogs-import OK" (built in `.next/verify`; default folder 1 unchanged)

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- 04-05 and 04-10 can keep reading `getCollectionFolderId()` and `collectionFolderName()`. The folder they return now follows the owner's choice.
- Human check for later: on Settings with Discogs connected, the folder list shows Uncategorized with its count, picking it shows the toast, the refresh button spins, and the Add buttons on Spines follow the chosen folder.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
