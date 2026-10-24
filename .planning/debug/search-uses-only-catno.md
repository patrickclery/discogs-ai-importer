---
status: awaiting_human_verify
trigger: "when I search for \"Vision just short of living\" on discogs, it's matching [the master/CD releases] but when i search on the app it's completely wrong. it appears to be searching just the catalog number \"kori\". even when i try to click \"Search Discogs\" it's not matching, it only works on the discogs.com ui"
created: 2026-10-23
updated: 2026-10-23
---

## Symptoms

- expected: Spine with Artist=VISION, Title=JUST SHORT OF LIVING, Catalog number=KORI (flagged low-confidence, 30%) should match Vision – Just Short Of Living (1992 / 2001 reissue CD), as discogs.com search "vision just short of living" does.
- actual: App's Discogs matches are all KORI-related (Evelyn Campos – Amor Loco Amor KORI-0001-2, Koriaz releases, NIEKORIMTO). Search appears to be driven by the catalog number only. Clicking "Search Discogs..." manually also fails to match.
- errors: none shown.
- timeline: observed now on photo cd-spines.heic; unknown whether it ever worked for this case.
- repro: Review the VISION / JUST SHORT OF LIVING spine in cd-spines.heic; observe matches; click "Search Discogs..." and search.
- notes: Catalog number "KORI" is likely a misread label logo (Kori? / actually a label mark) and has low confidence; a bad catno should not dominate or override artist+title. The manual search dialog should search with the user's free text (q=) like discogs.com.

## Current Focus

bug_class: Bohrbug (deterministic: same inputs, same recorded result)
status_note: RED confirmed. 3 new runCascade tests fail on current code (Vision -> catno, Kid606 exact-other-label -> catno, fallback makes 1 call not 3).
reasoning_checkpoint:
  hypothesis: "runCascade returns the catno stage whenever Discogs returns anything for catno=, because the first non-empty stage wins. Discogs catno= is fuzzy, so catno=KORI returns other labels' releases and artist_title (VISION / JUST SHORT OF LIVING) is never sent."
  confirming_evidence:
    - "demo/fixtures/discogs.json spine 01 was recorded by the real cascade: stage catno, 4 results, all catnoMatch false, none naming Vision"
    - "new unit test with the recorded KORI results returns stage catno and sends only 1 request"
  falsification_test: "if the cascade, given catno noise plus an artist_title hit, already returned artist_title, the hypothesis is wrong (it returns catno)"
  fix_rationale: "accept the catno stage only when one of its results names the spine's artist or title (normalized letters/digits containment); otherwise continue to artist_title and text, and fall back to the catno results only if every later stage is empty. Catno-only spines keep the old behavior."
  blind_spots: "containment can miss accent/spelling variants (then artist_title runs, one extra request; catno results remain the fallback). Ranking inside an accepted catno stage is unchanged (spine 37 Automator is 4th of 4 exact catno hits). Live Discogs was not queried; demo fixtures must be re-recorded by the owner."
  candidate_causes:
    - "code: cascade first-non-empty-wins rule (confirmed)"
    - "data: AI misread KORI at 30% confidence (contributing, but the app must tolerate bad reads; confidence is not in SearchInputs)"
    - "environment: demo stub dialog only matches recorded candidates (downstream of the code cause)"
  and_gate: "yes for the demo dialog symptom: cascade bug AND stubbed dialog search together. The automatic-match symptom needs only the cascade bug."
next_action: owner re-records demo spines 01 02 07 22 59 (pnpm demo:record after deleting those keys) and/or confirms on the real app; then archive

## Evidence

- timestamp: 2026-10-23
  checked: data/app.db (the only app.db) for VISION / KORI / SHORT OF LIVING
  found: no such spine; photos are IMG_3555/3557/3562. cd-spines.heic is the Phase 5 demo shelf (demo/fixtures/shelf.json source cd-spines.claude-opus-5-5.high). App is not running on 3001.
  implication: the owner saw this on the stubbed demo site, whose Discogs data (demo/fixtures/discogs.json, recordedAt 2026-10-23) was recorded live by scripts/demo/record-discogs.demo.ts using the app's real cascade (searchInputs -> runCascade -> rankCandidates).

- timestamp: 2026-10-23
  checked: demo/fixtures/discogs.json spine "01"
  found: inputs {artist VISION, title JUST SHORT OF LIVING, catno KORI}; stage "catno", total 4; candidates KORI-0001-2 Evelyn Campos, KORIAZ CD 02/01 L'Orchestre Empire Bakuba, NIEKORIMTO-2006-1. All catnoMatch false.
  implication: Discogs catno= search is fuzzy (substring/prefix); a 4-letter misread returns noise, and the cascade accepted it.

- timestamp: 2026-10-23
  checked: src/server/discogs/search.ts buildStages + runCascade
  found: stages are catno -> artist_title -> text; runCascade returns the first stage with results.length > 0. Field confidence is not part of SearchInputs at all.
  implication: any catno that returns anything (even fuzzy noise) blocks artist+title. Confirms the "searching just the catalog number" symptom.

- timestamp: 2026-10-23
  checked: all 35 catno-stage recordings in demo/fixtures/discogs.json
  found: wrong top candidates driven by the catno stage on spines 01 (Vision), 02 (deep rock / dox18), 22 (Kid606 IPC-48 -> Bohren & Der Club Of Gore, an exact catno of another label), 07 (beat me silly 10003-2 -> Marvin Gaye), 59 (Zentertainment 2004 ZENCD004 -> Sensient). Spine 14 (Blue Lines) had no exact catno but its results were right because they name Massive Attack / Blue Lines.
  implication: the deciding signal is not exact-catno but whether the catno results agree with the spine's artist or title. An exact-catno-only rule would miss 22/07/59 and would wrongly discard 14.

- timestamp: 2026-10-23
  checked: manual dialog path. Real app: src/app/api/spines/[id]/search/route.ts -> enqueueExplicitSearch(kind manual, queryText) -> search-spine.ts sends q=typed text, type=release, format=CD, per_page 25. Demo: src/demo/ops/review.ts startDialogSearch -> matchRecordings(query), which only filters allRecordedCandidates() (every word must appear in a recorded title/labels/catno).
  found: the real app sends the free text as q= like discogs.com. The demo can only return releases that some recording contains; Vision - Just Short Of Living is in no recording because the cascade stopped at catno.
  implication: the dialog failure on the demo is a downstream effect of the cascade bug; re-recording spine 01 with the fixed cascade puts the Vision releases into the recordings, after which the demo dialog finds them.

## Eliminated

- hypothesis: the manual Search Discogs dialog sends the catalog number (or a structured catno query) instead of the typed text
  evidence: dialog posts {mode:'text', value}; route classifies via parseDiscogsRef -> kind manual with queryText = typed text; search-spine.ts sends q=queryText. The demo's stub matches only recorded candidates.
  timestamp: 2026-10-23

## Resolution

root_cause: runCascade accepts the catno stage whenever Discogs returns anything for catno=. Discogs catno search is fuzzy, so a misread catno (KORI) returns unrelated releases and artist+title is never searched; the demo recorded that outcome; and the demo's dialog can only find recorded releases.
fix: src/server/discogs/search.ts adds catnoCorroborated() (some result title contains the spine's artist or title, letters/digits only, case folded; true when the spine has neither). runCascade skips an uncorroborated catno stage and keeps its results only as a fallback when every later stage is empty. Catno-only spines behave as before.
oracle_type: specified (expected stage and result ids from the recorded demo data)
verification:
  target_test: { result: pass }  # 5 new runCascade tests; 3 were RED before the fix
  mutation_check: { result: pass, reason_if_skipped: "no Stryker; 5 hand-seeded mutants at the fix site instead", mutant_killed: "5/5" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: n/a }  # additive gate plus fallback, no behavior removed
  adjacent_tests: { result: pass }  # full suite 102 files / 1785 tests, tsc --noEmit clean, biome clean
  revert_reconfirm: { result: pass }  # HEAD search.ts -> 3 fail; fixed -> 49 pass (+ search-spine handler 71 total)
  replay_on_recordings: "new rule over all 35 catno-stage demo recordings changes exactly 5 spines (01 Vision, 02, 07, 22, 59), all of which had a wrong top candidate; the 30 correct ones are unchanged"
  guardrail_verdict: accepted
  pending_human: "demo/fixtures/discogs.json still holds the old outcome; owner must re-record spines 01, 02, 07, 22, 59 (live Discogs, owner account) and rebuild the demo"
files_changed: [src/server/discogs/search.ts, src/server/discogs/search.test.ts]
