---
status: diagnosed
trigger: "UAT Test 3 (G-04-3): I clicked the wrong match, but it added it. I don't know what you were expecting."
created: 2026-10-22T00:00:00Z
updated: 2026-10-22T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic, missing feature by design)
hypothesis: CONFIRMED. No recovery path from `imported` exists because undo was explicitly deferred (04-CONTEXT D-02, Deferred Ideas, REQUIREMENTS DATA-01 v2). Every layer lacks it: client allowlist refuses DELETE, no store transition out of imported, DELETE route answers 409 started, UI hides Change match on imported. CR-01 lockout as described in UAT text is already fixed (7c6fa53); the residual CR-01 gap is that the check_import path adopts a landed wrong copy into `imported`, which hits the same dead end.
next_action: return ROOT CAUSE FOUND to orchestrator (diagnose-only).

## Symptoms

expected: After clicking Add on the wrong match, the owner can recover: undo the import (remove the copy from Discogs) or change the match to the right release — whether the add succeeded or failed (also CR-01 in 04-REVIEW.md / 04-REVIEW-DISPOSITION.md).
actual: User clicked "Add to Uncategorized" on the wrong candidate (Markatta – Markattasånger, catalog-number-only match) for spine "Maria Dunn – from where I stand – marcd01". It imported. Card shows "Imported" with the wrong confirmed match, no button to undo or change match. CR-01 variant: if Discogs errors on that add, card shows Import failed, Change match disabled ("Retry first. Discogs may already have added it."), Retry is the only action.
errors: None reported
reproduction: Test 3 in .planning/phases/04-import-review-queue/04-UAT.md
started: Discovered during UAT 2026-10-22

## Eliminated

- hypothesis: CR-01 failed-state lockout ("Retry first" tooltip, Change match disabled) still exists in code
  evidence: grep for "Retry first" in src/ returns nothing; commit 7c6fa53 (2026-10-22 14:44) added check_import; changeMatchState enables Change match for any failed phase; cancelImport returns `checking` and enqueues a no-POST check job. UAT test 3 text was copied from 04-VERIFICATION.md (commit 0aac9cb, 05:51), written before the fix.
  timestamp: 2026-10-22

## Evidence

- timestamp: 2026-10-22
  checked: data/app.db imports + discogs_candidates for the Markatta import
  found: import 01M5JZRWRZR5C97BVSVSFV8TTM status=imported, release 12370071, instance_id 2196854527 (real Discogs copy). Candidates: rank0 Markatta MARCD01, rank1 Venom Mar.cd01, rank2 Maria Dunn marcd01 — all catno_match=1, stage=catno.
  implication: wrong copy is on Discogs; spine is terminal.

- timestamp: 2026-10-22
  checked: src/server/discogs/client.ts isAllowed()
  found: GET anything; POST only /oauth/access_token and ADD_TO_FOLDER. Every other method (DELETE) is refused before any request. No removeInstance/deleteInstance function exists anywhere in src/server/discogs.
  implication: the client cannot remove a collection instance at all.

- timestamp: 2026-10-22
  checked: src/lib/import-types.ts canChangeMatchOf + src/server/imports/store.ts cancelImport
  found: canChangeMatchOf `default: return false` for phase imported; cancelImport then returns `started` (phase !== failed). No store function transitions out of `imported` (no undoImport/removeImport).
  implication: server refuses any change once imported.

- timestamp: 2026-10-22
  checked: src/app/api/spines/[id]/import/route.ts
  found: only POST (confirm) and DELETE (Change match -> cancelImport); started maps to 409. No undo/remove route.
  implication: no API endpoint for undo.

- timestamp: 2026-10-22
  checked: src/lib/import-view.ts changeMatchState + src/components/confirmed-match.tsx
  found: `if (dto.phase === 'imported') return { show: false ... }`; showRetry only for failed. Imported card renders only the state line, zero actions.
  implication: UI offers nothing on an imported card.

- timestamp: 2026-10-22
  checked: 04-CONTEXT.md lines 11, 30, 128; REQUIREMENTS.md:67
  found: "Not in this phase: undoing an import (deleting the Discogs instance)"; D-02 "After an import succeeds, the match is locked in this phase (undo is deferred)"; Deferred: "Undo import (DELETE the stored instance_id) ... needs a DELETE in the client"; DATA-01 "Undo an import (delete the Discogs instance)" listed as future requirement.
  implication: absence is a deliberate scoping decision, not a regression.

- timestamp: 2026-10-22
  checked: src/server/jobs/handlers/add-to-collection.ts check mode (post-7c6fa53)
  found: check_import adopts a landed copy (step 2, status -> imported, adopted=1) before the check-mode branch; deletes the import only when the read proves nothing landed; fails `other` when unsure (pages>1 or unplaced).
  implication: CR-01 is fixed for "nothing landed", but when the wrong POST did land, Change match ends in `imported` — same dead end as the success path. Unsure case loops (Change match -> check -> failed other).

- timestamp: 2026-10-22
  checked: src/server/discogs/search.ts runCascade/buildStages/rankCandidates
  found: cascade stops at the first stage with any result (catno first); rankCandidates is a stable partition on exact normalized catno only, Discogs order kept within group. No artist/title scoring.
  implication: Maria Dunn (catno+artist+title match) ties with two catno-only matches and keeps Discogs order (3rd). Phase 3 code; "smarter candidate ranking" is out of scope in 04-CONTEXT line 11.

## Resolution

root_cause: Undo/change-after-import was deliberately deferred (04-CONTEXT D-02 + Deferred Ideas; REQUIREMENTS DATA-01), so `imported` is a terminal state with no recovery at any layer: client.ts isAllowed() refuses DELETE (no remove-instance method), canChangeMatchOf/cancelImport refuse imported (409 started), no undo route exists, and changeMatchState hides Change match on imported. CR-01's described lockout is already fixed (7c6fa53, UAT text predates it), but its check_import path adopts a wrong copy that landed into `imported`, so it shares the same dead end.
fix:
verification:
files_changed: []
