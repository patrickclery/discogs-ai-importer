---
phase: 04-import-review-queue
verified: 2026-10-23T00:25:00Z
status: human_needed
score: 132/141 must-haves verified (5/5 roadmap success criteria, 127/136 plan truths; 9 await a browser check or an owner decision)
covered_files:
  - ".planning/phases/04-import-review-queue/04-01-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-01-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-02-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-02-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-03-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-03-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-04-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-04-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-05-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-05-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-06-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-06-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-07-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-07-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-08-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-08-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-09-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-09-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-10-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-10-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-11-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-11-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-12-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-12-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-13-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-13-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-14-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-14-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-15-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-15-SUMMARY.md"
  - "drizzle/0003_import_review.sql"
  - "drizzle/meta/0003_snapshot.json"
  - "drizzle/meta/_journal.json"
  - "scripts/lib/import-flow.ts"
  - "scripts/report-discogs-import-live.ts"
  - "scripts/verify-discogs-import.ts"
  - "scripts/verify-review-queue.ts"
  - "src/app/api/discogs/folders/route.test.ts"
  - "src/app/api/discogs/folders/route.ts"
  - "src/app/api/spines/[id]/dismiss/route.ts"
  - "src/app/api/spines/[id]/import/another/route.test.ts"
  - "src/app/api/spines/[id]/import/another/route.ts"
  - "src/app/api/spines/[id]/import/link-existing/route.test.ts"
  - "src/app/api/spines/[id]/import/link-existing/route.ts"
  - "src/app/api/spines/[id]/import/route.test.ts"
  - "src/app/api/spines/[id]/import/route.ts"
  - "src/app/api/spines/[id]/not-on-discogs/route.test.ts"
  - "src/app/api/spines/[id]/not-on-discogs/route.ts"
  - "src/app/api/spines/[id]/retry/route.test.ts"
  - "src/app/api/spines/[id]/retry/route.ts"
  - "src/app/api/spines/retry-failed/route.test.ts"
  - "src/app/api/spines/retry-failed/route.ts"
  - "src/app/api/spines/route.ts"
  - "src/app/settings/actions.test.ts"
  - "src/app/settings/actions.ts"
  - "src/app/spines/loading.tsx"
  - "src/app/spines/page.tsx"
  - "src/components/add-to-collection-button.tsx"
  - "src/components/already-in-collection.tsx"
  - "src/components/candidate-list.tsx"
  - "src/components/candidate-row.tsx"
  - "src/components/collection-folder-field.tsx"
  - "src/components/confirmed-match.tsx"
  - "src/components/discogs-card.tsx"
  - "src/components/discogs-matches.tsx"
  - "src/components/dismiss-spine-button.tsx"
  - "src/components/duplicate-import-dialog.test.ts"
  - "src/components/duplicate-import-dialog.tsx"
  - "src/components/import-state-badge.tsx"
  - "src/components/import-ui-context.tsx"
  - "src/components/not-on-discogs-line.tsx"
  - "src/components/photo-section.test.ts"
  - "src/components/photo-section.tsx"
  - "src/components/rescan-button.test.ts"
  - "src/components/rescan-button.tsx"
  - "src/components/retry-all-failed-button.tsx"
  - "src/components/review-status-filter.tsx"
  - "src/components/spine-action-menu.test.ts"
  - "src/components/spine-action-menu.tsx"
  - "src/components/spines-filter-bar.test.ts"
  - "src/components/spines-filter-bar.tsx"
  - "src/components/spines-view.tsx"
  - "src/components/status-indicator.tsx"
  - "src/components/ui/alert-dialog.tsx"
  - "src/components/ui/dropdown-menu.tsx"
  - "src/lib/import-types.ts"
  - "src/lib/import-view.test.ts"
  - "src/lib/import-view.ts"
  - "src/lib/review-status.test.ts"
  - "src/lib/review-status.ts"
  - "src/lib/scan-types.ts"
  - "src/lib/spine-review.test.ts"
  - "src/lib/status-text.test.ts"
  - "src/lib/status-text.ts"
  - "src/lib/status-types.ts"
  - "src/server/db/schema.ts"
  - "src/server/discogs/client.test.ts"
  - "src/server/discogs/client.ts"
  - "src/server/discogs/collection.test.ts"
  - "src/server/discogs/collection.ts"
  - "src/server/discogs/enqueue.test.ts"
  - "src/server/discogs/enqueue.ts"
  - "src/server/discogs/folders.test.ts"
  - "src/server/discogs/folders.ts"
  - "src/server/discogs/status.test.ts"
  - "src/server/discogs/status.ts"
  - "src/server/imports/queries.test.ts"
  - "src/server/imports/queries.ts"
  - "src/server/imports/recovery.test.ts"
  - "src/server/imports/recovery.ts"
  - "src/server/imports/sql.ts"
  - "src/server/imports/store.test.ts"
  - "src/server/imports/store.ts"
  - "src/server/jobs/handlers/add-to-collection.test.ts"
  - "src/server/jobs/handlers/add-to-collection.ts"
  - "src/server/jobs/handlers/index.ts"
  - "src/server/jobs/queue.ts"
  - "src/server/scan/merge.test.ts"
  - "src/server/scan/merge.ts"
  - "src/server/scan/not-on-discogs.test.ts"
  - "src/server/scan/not-on-discogs.ts"
  - "src/server/scan/orphans.test.ts"
  - "src/server/scan/orphans.ts"
  - "src/server/scan/queries.test.ts"
  - "src/server/scan/queries.ts"
  - "test/fixtures/fake-discogs.mjs"
  - "test/helpers/radix-open.ts"
covered_digest: "v3:sha256:04cc9237e4105d75b79076e104c72eb2934e0c572517a72627de1e333970ae49"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 129/135
  gaps_closed:
    - "G-04-7 (UAT test 7): duplicate dialog and photo filter overflow with a 120+ char photo name — fixed in code (04-15 plus its review fixes); browser re-check still pending"
    - "Previous human item 3 (decide on CR-01): fixed in 7c6fa53 (check_import path that never POSTs), acknowledged by the owner in 04-UAT test 3"
    - "Previous human items 1, 2, 4, 6, 8, 9: passed in 04-UAT (tests 1, 2, 4, 6, 8, 9)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Long photo name, browser re-check (G-04-7, UAT test 7 rerun). Use a photo whose file name is about 120 characters with no spaces. (a) On /spines, click Add on a CD that another spine already imported. (b) Click Re-scan on that photo. (c) Open the 'Filter by photo' dropdown. Do each in a full-size window and again with the window phone-narrow."
    expected: "(a) The duplicate dialog's title wraps inside the box. Both spine pictures and the Cancel and Add another copy buttons are inside and clickable. Each caption stops after two lines, and hovering it shows the full name. (b) The Re-scan dialog's title wraps inside the box, and its buttons stay visible. (c) The long name ends with '…' inside the list, hovering it shows the full name, short names look as before, and picking it filters the list to that photo."
    why_human: "Layout containment is a rendered-CSS outcome. Tests prove the right classes reach the real primitives and that Tailwind 4.3.3 emits them (grid-template-columns: minmax(0,1fr); overflow-wrap: anywhere; min-width: 0 on the ItemText span), but only a browser shows the box holds."
  - test: "Owner decision: accept the three plan truths that the 04-REVIEW fixes revised on purpose. (1) WR-06 revises A-04-09: an older failed search beside an open import now reads Matched, not Failed (04-05 truth 1). (2) CR-01: Change match on a failed import that may have reached Discogs now answers 202 and runs a check-only job that never POSTs, instead of 409 (04-12 truth 1). (3) The same fix removes the 'Retry first. Discogs may already have added it.' disabled state (04-03 E7 error truth)."
    expected: "You confirm each revision, or ask for the earlier rule back. Accepting adds three overrides entries to this file."
    why_human: "These are design choices that change written plan truths. 04-REVIEW-FIX.md says WR-06 'should be confirmed by the owner'. No record shows that it was."
  - test: "UAT test 5, card buttons at phone width (owner skipped). With the window phone-narrow, look at one card that is Waiting to import, one that is Already in your collection, and one that says Import failed."
    expected: "The buttons wrap onto a second line instead of running off the card, and the small cover picture keeps its size. If you would rather not set these states up, accept the 04-03 E7 overflow truth with an override instead."
    why_human: "Visual wrap at 360 px. The owner skipped it, so it has no evidence yet."
---

# Phase 4: Import & Review Queue Verification Report

**Phase Goal:** User confirms the right release for each spine and it lands in their Discogs collection exactly once. A status-driven list lets them work through the whole shelf to completion.
**Verified:** 2026-10-23T00:25:00Z
**Status:** human_needed
**Re-verification:** Yes. The earlier report (11:49Z) went stale after the 04-REVIEW fixes (CR-01, WR-01 to WR-06), UAT, gap plan 04-15 and the 04-15 review fixes. 38 source files changed. Every must-have was re-checked against the current code.

## MVP Mode Note (WARNING, carried forward)

ROADMAP marks Phase 4 `**Mode:** mvp`, but the goal is not in user-story form (`user-story.validate` returns `valid: false`). Phase 2 had the same mismatch. I verified against the five roadmap success criteria and every plan truth, and I mapped the goal's outcome in the User Flow Coverage table below. To make the mode canonical, run `/gsd-mvp-phase 4`.

## User Flow Coverage

| Step | Expected | Evidence in code | Status |
|------|----------|------------------|--------|
| Pick the right candidate and click Add | Nothing is written before that click | `client.ts` `isAllowed`: GET only, plus the token exchange and the one add path. The only add POST is `add-to-collection.ts:453`. The confirm route requires `{ candidateId }` listed for that spine. UAT 9 passed | ✓ |
| The copy lands in the chosen folder, once | A single POST, with the instance id recorded | Handler: read, then adopt or hold, then intent, then POST, then `UPDATE imports SET status='imported', instance_id`. UAT 1 and 2 passed on the real account | ✓ |
| Warned about duplicates | 409 dialog for a local duplicate. Already-in-collection hold for a foreign copy | `DuplicateImportDialog` is wired in `add-to-collection-button.tsx:203`. The foreign hold is at `add-to-collection.ts:390`. UAT 6 passed. Long names were fixed by 04-15 (browser re-check pending) | ✓ (long-name visual pending) |
| Work the shelf to completion | Six status filters with counts, retry, mark not on Discogs | `ReviewStatusFilter` with `counts.byStatus`. `RetryAllFailedButton`. Retry and not-on-discogs routes. `SpineActionMenu` | ✓ |

## Goal Achievement

### Roadmap Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Nothing reaches Discogs until the user confirms a specific candidate. After confirming, the release is in the chosen folder (Uncategorized by default) and the spine shows Imported | ✓ VERIFIED | Write gate in `src/server/discogs/client.ts:118-130`. One POST site. Folder from settings (`getCollectionFolderId`, default 1). The CR-01 check path never POSTs (`add-to-collection.ts:373-388`, test "nothing landed: one read, never a POST"). UAT 1 and 9 passed |
| SC2 | Warned before confirming if the release is already in the collection or was already imported from another photo | ✓ VERIFIED | Local duplicate 409 plus dialog. Foreign copy held `already_in_collection` with no POST. Link existing and Add another copy routes. UAT 6 passed. UAT 7 showed the dialog working; only its long-name layout broke, which 04-15 fixed in code |
| SC3 | Killing the app mid-import or retrying never duplicates, and every imported spine records its instance id | ✓ VERIFIED | Behavioral tests in `add-to-collection.test.ts` pass, among them "after a crash with the intent written, the next attempt adopts and never posts", "after an add that timed out … adopts the copy without a second POST", "a local clock minutes ahead … never a second POST (WR-04)", "allow_duplicate with an unplaced copy … holds instead of posting again", and "an instance id another import already records fails other with no second POST". `imports_instance_idx` is unique. UAT 2 (real SIGINT mid-import) passed, and the handler is unchanged since |
| SC4 | Filter by pending, matched, imported, not found, not on Discogs and failed, with counts | ✓ VERIFIED | `src/lib/review-status.ts` (six statuses, `parseStatusParam` allowlist). `review-status-filter.tsx` renders `counts.byStatus[s]`. Wired in `spines-filter-bar.tsx:70` |
| SC5 | Retry any failed item without re-upload. Mark "not on Discogs" | ✓ VERIFIED | `POST /api/spines/[id]/retry`, `POST /api/spines/retry-failed`, `POST /api/spines/[id]/not-on-discogs` (`{ flag: boolean }` marks and unmarks). `SpineActionMenu` is wired in `discogs-matches.tsx:405`. WR-02 and WR-03 guards are tested |

### Plan Truths (04-01 to 04-15)

There are 136 plan truths: 127 verified and 9 pending (see Human Verification).

**Regression check (04-01 to 04-14).** The previous report verified 124 of 130 non-backstop truths in detail. Since then, 38 files changed. I re-read the changed import, merge, orphan, not-on-discogs, review-status and route code. The full suite passes apart from one Phase 2 timing flake (see Behavioral Spot-Checks). It includes the new tests for CR-01, WR-01 to WR-06 and G-04-7. Typecheck and lint are clean. No truth regressed. Three truths were revised on purpose by the review fixes and await owner confirmation:

| Truth | Was | Now | Status |
|-------|-----|-----|--------|
| 04-05 #1 reviewStatusOf order | An open import plus an older failed search reads `failed` (A-04-09) | It reads `matched`. Search-failed counts only when there is no import (`review-status.ts:39-43`, WR-06) | ? UNCERTAIN (owner decision) |
| 04-12 #1 DELETE /import | Otherwise 409 `started` | A failed import with an intent answers 202 `{checking:true}` and enqueues `check_import`, which deletes only when a complete read proves nothing landed (CR-01) | ? UNCERTAIN (owner decision; the safety intent is kept and stronger) |
| 04-03 E7 error | Change match disabled with "Retry first…" | Change match is enabled and shows "Checking your Discogs collection…" (CR-01) | ? UNCERTAIN (owner decision) |

**Backstop truths (owner evidence):**

| Truth | Evidence | Status |
|-------|----------|--------|
| 04-09 real account, exactly once, survives a stop | UAT 1 and 2 passed. UAT was recorded at 23:54Z, after the review-fix commits (20:44Z to 20:50Z). The handler has not changed since | ✓ VERIFIED |
| 04-03 E6 long folder name on Add | UAT 4 passed | ✓ VERIFIED |
| 04-13 E8 already-in-collection wraps | UAT 6 passed. 48941e9 dropped only the dead `break-words`, which leaves the effective rule unchanged | ✓ VERIFIED |
| 04-14 E4 photo header at 360 px | UAT 8 passed | ✓ VERIFIED |
| 04-14 E7 polling, E1 counts ignore filters | `queries.test.ts` passes | ✓ VERIFIED |
| 04-03 E7 overflow at 360 px | UAT 5 skipped by owner | ? UNCERTAIN |
| 04-13 E9 dialog with a 120-char name | UAT 7 failed, then fixed by 04-15 | ? UNCERTAIN (browser re-check) |

**04-15 truths (G-04-7):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The dialog title wraps inside the box at both widths | ? UNCERTAIN | The rendered title has `min-w-0 [overflow-wrap:anywhere]` and no other wrap utility (test against the real primitive). The content grid now has `grid-cols-[minmax(0,1fr)]` in the shared `ui/alert-dialog.tsx`. Tailwind 4.3.3 emits both. A browser must confirm |
| 2 | Body, both pictures and both buttons stay inside | ? UNCERTAIN | The same bounded column, and `AlertDialogHeader` has `min-w-0`. A browser must confirm |
| 3 | Captions clamp to two lines with the full caption on hover | ✓ VERIFIED | The rendered `CropWell` figcaption has `title` equal to the full caption plus `line-clamp-2 break-all`. The figure has `min-w-0` and the img has `max-w-full` |
| 4 | Photo filter: a long name ends in an ellipsis, with the full name on hover | ? UNCERTAIN | The rendered `role=option` rows carry `title={filename}` and `*:[span]:last:min-w-0` next to the real `*:[span]:last:flex`. Compiled CSS gives `min-width:0` to the ItemText span. A browser must confirm |
| 5 | Short names and All photos unchanged. Picking a photo still filters | ✓ VERIFIED | `value` is still `p.id`. The All photos row has no title. The inner `truncate` span is unchanged |
| 6 | (backstop) Manual check at both widths | ? UNCERTAIN | Pending, human item 1 |

**Score:** 132/141 verified (0 present but behavior-unverified).

### Required Artifacts (04-15)

| Artifact | Status | Details |
|----------|--------|---------|
| `src/components/duplicate-import-dialog.tsx` | ✓ VERIFIED | Exports both class constants and `CropWell`. Wired to the call site |
| `src/components/duplicate-import-dialog.test.ts` | ✓ VERIFIED (deviation) | `verify.artifacts` flags "Missing pattern: DUPLICATE_DIALOG_TITLE_CLASS". This is intentional: the WR-01 fix (41cf273) replaced the constant-only tests with real-component renders that assert the rendered classes, which is stronger. Not a stub |
| `src/components/spines-filter-bar.tsx` | ✓ VERIFIED | `PHOTO_OPTION_ITEM_CLASS` and `photoOptionItemProps`, spread into each photo `SelectItem` |
| `src/components/spines-filter-bar.test.ts` | ✓ VERIFIED | Renders the real `SpinesFilterBar` in `NuqsTestingAdapter` with the Select open |
| `src/components/ui/alert-dialog.tsx` (review fix) | ✓ VERIFIED | `grid-cols-[minmax(0,1fr)]` on the content and `min-w-0` on the header protect all five AlertDialogs |
| `src/components/rescan-button.tsx` + test (review fix) | ✓ VERIFIED | The title is `min-w-0 [overflow-wrap:anywhere]`, pinned by a render test |
| `test/helpers/radix-open.ts` | ✓ VERIFIED | Renders the Portal inline and forces it open, for the server-render tests |

### Key Link Verification

`verify.key-links` on 04-15 verified all 3 links: the title class, the content class and the `{...photoOptionItemProps(p)}` spread. The phase 4 links from earlier plans still resolve: `AddToCollectionButton` to `candidate-list.tsx:129`, `DuplicateImportDialog` to `add-to-collection-button.tsx:203`, `ReviewStatusFilter` and `RetryAllFailedButton` to `spines-filter-bar.tsx`, `SpineActionMenu` to `discogs-matches.tsx:405`, and `check_import` to `handlers/index.ts`.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Status |
|----------|------|--------|--------|
| ReviewStatusFilter counts | `counts.byStatus` | `getSpines` SQL over the imports and spines tables | ✓ FLOWING |
| Duplicate dialog title and captions | `duplicate.photo` | 409 body from the import route (`photos.original_name`) | ✓ FLOWING |
| Photo filter rows | `photoOptions` | `/api/spines` read model | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (run once) | `node_modules/.bin/vitest run` | 86 files, 1605/1606 pass. The 1 failure is `src/server/claude/cli.test.ts` "times out a sleeping child … kills its whole process group" | ✓ PASS (see note) |
| That failing test alone, 3 times | `vitest run src/server/claude/cli.test.ts -t "times out a sleeping child"` | Passed 3 of 3 | ✓ Load flake. The file is from Phase 2 and Phase 4 never touched it |
| Typecheck | `tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `biome check` | 322 files, clean | ✓ PASS |
| New utilities emit CSS | `@tailwindcss/node` 4.3.3 `compile().build([...])` | `grid-template-columns: minmax(0,1fr)`, `overflow-wrap: anywhere`, `:is(.*:[span]:last:min-w-0 > *):is(span):last-child { min-width: 0px }` | ✓ PASS |
| 04-15 commits exist | `verify.commits` | 7 of 7 valid | ✓ PASS |
| Fake-Discogs end-to-end scripts | not run (they build and start a Next server) | 04-REVIEW-FIX reports steps a to i and a to f OK | ? SKIP (no server starts allowed) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist, and no plan declares a probe. Not applicable.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| IMP-01 | 04-01, 03, 10, 12 | Explicit confirm before any add | ✓ SATISFIED | SC1 |
| IMP-02 | 04-01, 06, 10, 11 | Chosen folder, default Uncategorized | ✓ SATISFIED | SC1, UAT 1 and 4 |
| IMP-03 | 04-02, 04, 13, 15 | Warn on already in collection or already imported | ✓ SATISFIED (long-name visual pending) | SC2 |
| IMP-04 | 04-01, 02, 04, 07, 09, 10, 11 | Never duplicated, instance id recorded | ✓ SATISFIED | SC3, UAT 2 |
| REV-03 | 04-05, 14, 15 | Filter by six statuses with counts | ✓ SATISFIED | SC4 |
| REV-04 | 04-03, 09, 12 | Retry failed without re-upload | ✓ SATISFIED | SC5 |
| REV-05 | 04-07, 08 | Mark "not on Discogs" | ✓ SATISFIED | SC5 |

REQUIREMENTS.md maps exactly these 7 IDs to Phase 4, and plans claim every one. None is orphaned.

### Anti-Patterns Found

The 38 source files changed since the last report have no TBD, FIXME, XXX, TODO, HACK or placeholder markers.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/spines-filter-bar.tsx` | The full name sits only in a native `title`, so keyboard and touch users cannot read a truncated name (04-15 review IN-01, skipped) | ℹ️ Info | Meets the plan's "on hover" wording |
| `src/components/spines-filter-bar.tsx` | `title` on `role=option` may make screen readers repeat the name (IN-02, skipped) | ℹ️ Info | Accessibility polish |
| 04-15-PLAN acceptance | "no change to src/components/ui/" was broken on purpose by the review fix (fea7c49) | ℹ️ Info | Justified: it bounds every AlertDialog |
| `.planning/ROADMAP.md:197` | 04-15 is still `[ ]`, and the progress table says 14/14 | ℹ️ Info | Bookkeeping, for the orchestrator |
| 04-REVIEW IN-01 to IN-05 | Open info findings | ℹ️ Info | None defeats a criterion |

### Human Verification Required

1. **Long photo name, browser re-check (G-04-7).** Use a photo with a name of about 120 characters and no spaces. At full width and at phone width, check: the duplicate dialog (title wraps, both pictures and both buttons inside, captions stop at two lines with the full name on hover), the Re-scan dialog (title wraps, buttons visible), and the photo filter dropdown (ends with "…", hover shows the full name, picking it still filters).
2. **Owner decision on three revised truths.** WR-06 (an older failed search beside an open import now reads Matched), and CR-01 (Change match on a possibly-landed failed import runs a check that never POSTs and answers 202, so the "Retry first" disabled state is gone). Accept, or ask for the earlier rules back. To accept, add:

```yaml
overrides:
  - must_have: "reviewStatusOf gives exactly one status per spine in D-10 order: ... failed (the latest import failed, or the latest search failed or was refused) ..."
    reason: "WR-06 revises A-04-09: an import replaces the search on the card, so an older failed search beside an open import reads matched"
    accepted_by: "patrick"
    accepted_at: "<ISO timestamp>"
  - must_have: "DELETE /api/spines/{id}/import (Change match) succeeds only while nothing can have reached Discogs ... otherwise it answers 409 started"
    reason: "CR-01: a failed import with an intent answers 202 and runs check_import, which never POSTs and deletes only when a complete read proves nothing landed"
    accepted_by: "patrick"
    accepted_at: "<ISO timestamp>"
  - must_have: "UI-SPEC E7 error: ... Change match is enabled only when canChangeMatch, else disabled with the tooltip 'Retry first. Discogs may already have added it.'"
    reason: "CR-01 replaced the lockout with the check-only Change match path"
    accepted_by: "patrick"
    accepted_at: "<ISO timestamp>"
```

3. **Card buttons at phone width (UAT 5, skipped).** In the Waiting, Already in your collection and Import failed states, the buttons should wrap and the cover keep its size. You can also accept this with an override.

### Gaps Summary

Nothing failed. All five roadmap success criteria hold in the current code. Behavioral tests back them, and they pass after the 04-REVIEW fixes changed the import handler. The real-account UAT (tests 1 and 2) ran after those fixes. All 7 requirement IDs are satisfied. G-04-7 is fixed in code, and the review fixes widen it to every AlertDialog. Tests now render the real primitives, and the compiled CSS checks out. The phase is held at human_needed for three reasons:
- the browser re-check of the long-name fix;
- an owner sign-off on three plan truths that the review fixes revised on purpose;
- the UAT 5 visual check, which the owner skipped.

UAT test 3 (undo after a wrong-match import) is an owner-deferred follow-up (D-02 / DATA-01), not a Phase 4 gap.

---

_Verified: 2026-10-23T00:25:00Z_
_Verifier: Claude (gsd-verifier)_
