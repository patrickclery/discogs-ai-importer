---
phase: 02-shelf-scan
plan: 09
subsystem: review-ui
tags: [spines, field-editing, patch, react-query, optimistic, tracer, tdd]
status: complete

requires:
  - phase: 02-03
    provides: spine_fields (ai_value, value, confidence, edit_base_ai_value), SpineFieldDto
  - phase: 02-08
    provides: spine-review helpers, SpineCard slots, polled ['spines', { photo }] query, verify-scan steps
provides:
  - PATCH /api/spines/{id}/fields (edit or revert one field; ai_value never written)
  - src/server/scan/fields.ts updateSpineField / revertSpineField
  - SpineField (autosave on blur, polling guard, warning, Saving, Edited, revert + Undo revert, inline save error)
  - WorstFieldBadge ("Check {field} · {pct}%" / "Hard to read")
  - src/components/ui/textarea.tsx (shadcn)
  - spine-review additions: FIELD_LABELS, resolveDisplayedValue, withSpineField, lowConfidenceTooltip, revertTooltip, worstFieldText, MAX_FIELD_CHARS
  - verify-scan step (p) PATCH edit, reload, revert, 415 and 404
affects: [02-10 re-scan merge (edit_base_ai_value, "Latest scan reads" hint in SpineField), 02-12 filters (Needs review uses isLowConfidence)]

actuals:
  tokens: 12700
  tasks: 2
  commits: 3
plan_head_before: c50099cc17ba91ac11e2d3fdf2bdc2834f639fad
plan_head_after: 3a378dc1ba581ed730740243572a64e73064d614

tech-stack:
  added: []
  patterns:
    - "Field edits: one UPDATE ... WHERE EXISTS(editable spine) RETURNING, then a SELECT only to tell 404 from 409"
    - "better-sqlite3 named params (@name); ?NNN numbered params broke the statement at runtime"
    - "Client edit: local draft + focused/dirty flags; resolveDisplayedValue decides what the input shows"
    - "Mutation: cancelQueries(['spines']) + setQueriesData(withSpineField) optimistic, rollback of the cache (not the draft) on error, invalidate on settle"
    - "Per-call mutate callbacks own the field's UI state (error copy, dirty, revert toast)"

key-files:
  created:
    - src/app/api/spines/[id]/fields/route.ts
    - src/app/api/spines/[id]/fields/route.test.ts
    - src/server/scan/fields.ts
    - src/components/spine-field.tsx
    - src/components/worst-field-badge.tsx
    - src/components/ui/textarea.tsx
    - .planning/phases/02-shelf-scan/tdd-evidence/02-09-task2-red.json
  modified:
    - src/lib/spine-review.ts
    - src/lib/spine-review.test.ts
    - src/components/spine-card.tsx
    - src/components/photo-section.tsx
    - src/components/spines-view.tsx
    - scripts/verify-scan.ts

key-decisions:
  - "isEdited normalizes both sides (trim, empty to null) and then compares exactly, with no case folding"
  - "Orphaned spines stay editable (UI-SPEC); superseded and dismissed return 409; an editable spine with no field row returns 404"
  - "A failed save rolls back the query cache to the last saved state but keeps the draft in the input, dirty, so the next blur retries"
  - "Hard to read shows for any illegible detection, even with no flagged field (UI-SPEC 'instead'); Check {field} shows only when a field is below the threshold"
  - "The confidence threshold reaches SpineCard as a prop from GET /api/spines (SpinesView -> PhotoSection -> SpineCard -> SpineField)"

patterns-established:
  - "FIELD_LABELS lives in src/lib/spine-review.ts (client-safe), not in spine-card.tsx"
  - "Field copy (tooltips, badge text) are pure helpers in spine-review.ts with unit tests"

requirements-completed: [REV-02]

coverage:
  - id: D1
    description: "PATCH edits or reverts one field; ai_value stays byte-identical; 415/400/404/409 gates"
    requirement: REV-02
    verification:
      - kind: unit
        ref: "src/app/api/spines/[id]/fields/route.test.ts#edit then revert leaves ai_value byte-identical (D-10)"
        status: pass
      - kind: unit
        ref: "src/app/api/spines/[id]/fields/route.test.ts (11 tests)"
        status: pass
      - kind: integration
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts (p)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Edit detection, strict threshold, worst field, polling guard and field copy helpers"
    requirement: REV-02
    verification:
      - kind: unit
        ref: "src/lib/spine-review.test.ts (26 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SpineField UI: blur save survives reload with Edited, warning border and tooltip, Saving, inline save error, Escape, revert toast with Undo revert, Raw text grows 2 to 6 rows"
    requirement: REV-02
    verification:
      - kind: integration
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts (p) edit, reload, revert"
        status: pass
    human_judgment: true
    rationale: "Interaction and layout (typing during a poll, tooltip, toast undo, 360px/1280px textarea) need a browser check at end-of-phase verification"
  - id: D4
    description: "Card header WorstFieldBadge and Edited · n"
    verification:
      - kind: unit
        ref: "src/lib/spine-review.test.ts#names the worst field in lower case with its percent"
        status: pass
    human_judgment: true
    rationale: "Badge placement in the card header is visual"

duration: 8min
completed: 2026-10-20
---

# Phase 2 Plan 09: Editable spine fields Summary

**Every spine field on /spines can now be edited in place. Leaving a field saves it through `PATCH /api/spines/{id}/fields`, and Claude's original read stays in `ai_value`, which the route never writes. Edited fields show an "Edited" badge and a revert button whose toast offers "Undo revert". Fields below the confidence threshold get a warning border and tooltip, and each card header shows "Check {field} · {pct}%" and "Edited · n".**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-20T04:36:50Z
- **Completed:** 2026-10-20T04:45:13Z
- **Tasks:** 2 (1 tracer, 1 TDD)
- **Files modified:** 13

## Accomplishments

- `updateSpineField` and `revertSpineField` are each a single `UPDATE … RETURNING`, guarded by an editable-spine `EXISTS`. They write `value`, `edit_base_ai_value` and `updated_at` and nothing else.
- The PATCH route returns 415 for any non-JSON request. The body is validated as a zod union, `{ field, value ≤ 500 }` or `{ field, revert: true }`. Values are trimmed and an empty value becomes null. A missing spine returns 404 and a superseded or dismissed spine returns 409.
- `SpineField` keeps a local draft. While the field is focused or has unsaved text, a poll never changes it. Saving on blur uses `cancelQueries` and an optimistic `setQueriesData`. Enter commits an Input and Ctrl/Cmd+Enter commits Raw text. Escape restores the saved value without saving.
- Low-confidence fields (strictly below the threshold, AI read non-empty, not edited) get `border-warning`, `ring-warning/40`, a focusable `TriangleAlert` tooltip and an sr-only `aria-describedby` hint.
- A failed save keeps the draft, sets `aria-invalid` and shows "Not saved: {reason}. Leave the field again to retry." inline, with no toast. The next blur retries.
- Raw text uses the shadcn Textarea. It starts at 2 rows, grows to 6 and then scrolls.

## Task Commits

1. **Task 1 (tracer): edit, reload, Edited badge, Claude's read kept.** `82490ef` (feat)
2. **Task 2 RED: failing tests for edit detection, copy and the PATCH route.** `84072ef` (test)
3. **Task 2 GREEN: warning, revert with undo, failed-save drafts, textarea, worst-field badge.** `3a378dc` (feat)

## TDD Gate Compliance

- **RED:** `84072ef`. The target was `src/lib/spine-review.test.ts > isEdited (02-09) > compares after trimming, so padding alone is not an edit`. It failed on its `toBe` assertion (expected false, got true) because `isEdited` did not normalize. The classifier returned `RED_EVIDENCE_OK` (`tdd-evidence/02-09-task2-red.json`). The four copy-helper tests failed with a TypeError because their exports did not exist yet, so they were not used as machine RED. The route tests describe the Task 1 tracer route and already passed at RED.
- **GREEN:** `3a378dc`. 37/37 targeted tests pass and the full suite passes (405).
- **REFACTOR:** none needed.

## Decisions Made

- `isEdited` trims both sides and maps empty to null, then compares exactly.
- Orphaned spines stay editable.
- On failure the query cache is rolled back to the last saved value, but the input keeps the draft.
- "Hard to read" shows for any illegible detection. "Check {field}" shows only when a field is below the threshold.
- The threshold is passed down as props from `GET /api/spines`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] better-sqlite3 rejected `?NNN` numbered parameters**
- **Found during:** Task 1 (verify-scan step p returned a 500 with an empty body)
- **Fix:** The statements now use named `@value/@now/@spineId/@field` parameters.
- **Files modified:** src/server/scan/fields.ts
- **Commit:** 82490ef

**2. [Rule 1 - Bug] `isEdited` did not normalize**
- **Issue:** The truth requires the compare to run after trimming and mapping empty to null. The 02-08 helper compared the raw values.
- **Fix:** Both sides are normalized. `isLowConfidence` also treats a whitespace-only AI read as empty.
- **Commit:** 3a378dc

**3. [Structure] FIELD_LABELS moved to spine-review.ts**
- The worst-field text and revert aria-label need the labels in a client-safe, testable module. `spine-card.tsx` keeps `FIELD_SPANS`.

**4. [Structure] Raw text was an Input in Task 1**
- The plan's Task 1 lists Input for the first five fields only. All six used Input until Task 2 brought in the Textarea for Raw text.

---

**Total deviations:** 4 (2 bugs, 2 structural). **Impact:** no scope change.

## Issues Encountered

None beyond the deviations above.

## Verification

- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`: clean
- `corepack pnpm test`: 27 files, 405 tests passed
- `corepack pnpm vitest run src/lib/spine-review.test.ts src/app/api/spines`: 37 passed (26 in spine-review)
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts`: `verify-scan OK`, including (p): the edit keeps aiValue, survives a reload and reverts, text/plain returns 415 and an unknown spine returns 404
- Acceptance greps: updateSpineField 1, revertSpineField 1, cancelQueries 1, PATCH 1, textarea present with font-semibold 0, border-warning 1, "Leave the field again to retry" 1, "Undo revert" 1
- Tracer gate (auto mode): verify re-ran end to end and passed before Task 2
- `shadcn add textarea` added one file and changed no package

## Human checks deferred to end-of-phase verification

- Change a title, click away and reload. The new title shows "Edited" and the card header shows "Edited · 1".
- A low-confidence field shows the amber border and the tooltip.
- Type in a field while a scan polls. The text never jumps.
- Escape restores the saved value. Revert, then "Undo revert".
- A 300-character raw text grows to 6 rows and scrolls, at 360px and 1280px.

## Next Phase Readiness

- 02-10 can add the "Latest scan reads …" hint under the control in `SpineField`, using `editBaseAiValue`. Revert and Undo already go through the same route.
- 02-12's Needs review filter can reuse `isLowConfidence`/`needsReview`, which now share the normalized `isEdited`.

## Self-Check: PASSED

- All 7 created files exist on disk. Commits 82490ef, 84072ef and 3a378dc are ancestors of HEAD.
