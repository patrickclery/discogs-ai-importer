# Phase 4: Import & Review Queue - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The owner picks one candidate per spine and confirms it. Only then is the release added to their Discogs collection, in the chosen folder (Uncategorized by default), exactly once, with the Discogs `instance_id` recorded. Before confirming, they are warned if the release is already in their Discogs collection or was already imported from another spine. The /spines list gets a status filter (pending, matched, imported, not found, not on Discogs, failed) with counts, a retry for any failed item, and a "Not on Discogs" mark.

**Not in this phase:** undoing an import (deleting the Discogs instance), bulk accept, keyboard-driven review, writing notes, condition or custom fields to the instance, smarter candidate ranking. This is the first phase that writes to the owner's Discogs account, and the only write is the single add-to-collection POST.

</domain>

<decisions>
## Implementation Decisions

All decisions below were auto-selected (`--auto`) using the recommended option. Review them before planning if any look wrong.

### Carried forward (not re-asked)
- No automatic match preselect. The owner always picks (Project decision, Phase 3).
- All Discogs HTTP goes through the in-house client and the durable `jobs` table on the `discogs` lane (concurrency 1, ~1.1 s pacing, 429 reschedules via `run_after` without counting as an attempt). Phase 3 D-05/D-06.
- The client is read-only by construction (`isAllowed` in `src/server/discogs/client.ts`). Phase 4 widens it by exactly the writes listed in D-06, nothing more.
- Candidates render in the spine card footer slot (Phase 2 D-11, Phase 3 D-12); the status slot shows the spine's state.
- Mutating routes are JSON-only behind the proxy Origin guard (`src/proxy.ts`). Paid or rate-limited work is always enqueued, never run inline in a route.
- Orphaned spines with a match or import are never dropped (Phase 2 D-16).

### Confirming a candidate (IMP-01)
- **D-01:** Each candidate row gets an "Add to collection" button (label includes the folder, e.g. "Add to Uncategorized"). It is the only path to a collection write. Clicking it records the choice on the spine (`confirmed_release_id`, plus which candidate) and enqueues one `add_to_collection` job. The card status shows "Importing…" then "Imported". The other candidates collapse behind "Change match" until the import finishes.
- **D-02:** One confirmed release per spine. Before the import job starts, the owner can cancel or pick a different candidate. After an import succeeds, the match is locked in this phase (undo is deferred).

### Collection folder (IMP-02)
- **D-03:** A "Collection folder" select on the Settings Discogs card, loaded from `GET /users/{username}/collection/folders`, excluding folder 0 ("All", read-only). It defaults to folder 1 "Uncategorized" and is stored in the `settings` table. There is no per-spine folder override. Each import records the folder id it used.

### Duplicate warnings (IMP-03)
- **D-04:** Local check first, instantly and with no Discogs call: if the same `release_id` is already imported or importing from another spine, clicking Add opens an AlertDialog ("Already imported from {photo}, spine #{n}") with "Add another copy" and "Cancel". This also catches overlapping shelf photos.
- **D-05:** Remote check runs inside the `add_to_collection` job, before any POST: `GET /users/{username}/collection/releases/{release_id}`. If the release already has instances that this app didn't create, the job does not POST. The spine goes to an "Already in your collection" state with two actions: "Link existing copy" (records the existing `instance_id`, marks the spine imported, no write) and "Add another copy" (re-enqueues with `allow_duplicate`). This uses one extra read per import, which is acceptable at the pacing above.

### Exactly-once import (IMP-04)
- **D-06:** The client allowlist adds exactly: `GET /users/{u}/collection/folders`, `GET /users/{u}/collection/releases/{id}`, and `POST /users/{u}/collection/folders/{folder_id}/releases/{release_id}` with a non-zero folder. No DELETE, no PUT.
- **D-07:** An `imports` row (spine, release_id, folder_id, status `pending|importing|imported|already_in_collection|failed`, `instance_id`, `intent_at`, error) is written before the POST, in the same transaction that claims the job. The POST is never retried blindly. On any start or retry where the row is `importing` without an `instance_id` (crash, timeout, 5xx), the job first re-reads `collection/releases/{release_id}` and adopts an instance whose `date_added` is at or after `intent_at` (minus a small clock-skew margin). It POSTs only if none is found.
- **D-08:** A unique constraint guarantees at most one non-failed import per spine. The job dedupe key is `import:{spine_id}:{release_id}`. Success stores `instance_id` and `folder_id` from the POST response.
- **D-09:** Failure classes: 429 reschedules (Phase 3 D-06). Network, timeout and 5xx go through the reconcile in D-07 on the next attempt (up to 3), then `failed`. 401/403 → `failed` with "Reconnect Discogs". 404 on the release → `failed` with "Release not found on Discogs".

### Status model and filter (REV-03)
- **D-10:** One derived review status per spine, computed server-side in a pure function (unit-tested), precedence top-down:
  1. `imported` — import has an `instance_id` (including "Link existing copy")
  2. `not_on_discogs` — owner marked it
  3. `failed` — latest import failed, or latest search failed / auth_failed
  4. `matched` — a release is confirmed and the import is queued, importing, or waiting on the "Already in your collection" choice
  5. `not_found` — latest search finished with no results and no manual candidate
  6. `pending` — everything else (not searched, searching, or candidates waiting for a pick)
- **D-11:** The /spines filter bar replaces the All / Needs review toggle with a status ToggleGroup: All · Pending · Matched · Imported · Not found · Not on Discogs · Failed, each with a count. It is stored in the URL as `?status=` (nuqs), and combines with `?photo=`. "Needs review" (low confidence) stays as a separate toggle, since it is about field confidence, not import state. Counts come from `GET /api/spines` and cover active and orphaned spines only (superseded and dismissed are excluded).
- **D-12:** The default view is All. Photo section headers show a small per-photo progress line ("12 / 40 imported").

### Retry and Not on Discogs (REV-04, REV-05)
- **D-13:** A failed item shows its reason and one Retry button. For a failed search it re-enqueues the search with the current fields. For a failed import it re-enqueues `add_to_collection`, which reconciles before any POST (D-07). Neither re-uploads or re-scans the photo. When the Failed count is above 0, the filter bar shows "Retry all failed".
- **D-14:** "Mark not on Discogs" is in the card's action menu and is shown prominently on `not_found` spines. It sets a flag on the spine, hides the candidate list, and is reversible with "Unmark". It is not allowed on an imported spine.

### Claude's Discretion
- Exact table and column names (`imports` vs columns on `spines`) and the migration layout.
- The clock-skew margin and the exact reconcile matching rule, within D-07.
- Where the folder list is cached and when it refreshes.
- Visual details of the status ToggleGroup on narrow screens (scroll vs wrap), within the existing UI-SPEC tokens.
- Whether "Retry all failed" is one bulk route or a loop over per-spine routes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — IMP-01..IMP-04, REV-03..REV-05
- `.planning/ROADMAP.md` § Phase 4 — goal and 5 success criteria
- `.planning/PROJECT.md` — constraints and Key Decisions (human confirms every match, no auto preselect, CDs only)

### Discogs research
- `.planning/research/PITFALLS.md` — Pitfall 5 (master vs release ids), Pitfall 6 (POST is not idempotent: intent row, never auto-retry, reconcile via `collection/releases/{id}`), folder 0 read-only, "kill mid-POST" verification item, recovery table
- `.planning/research/FEATURES.md` — already-in-collection warning, folder choice, local cross-photo dedup, undo import (deferred)
- `.claude/CLAUDE.md` § Discogs Integration — add-to-collection endpoint, folder 1 Uncategorized

### Prior phase decisions
- `.planning/phases/03-discogs-match/03-CONTEXT.md` — D-05/D-06 queue and 429 handling, D-11 search states, D-12 candidate list, D-15/D-16 manual candidates
- `.planning/phases/02-shelf-scan/02-CONTEXT.md` — D-07 /spines filters, D-11 card slots, D-16 orphans
- `.planning/phases/01-foundation/01-CONTEXT.md` — jobs, lanes, worker lease, status indicator
- `.planning/phases/03-discogs-match/03-UI-SPEC.md`, `.planning/phases/02-shelf-scan/02-UI-SPEC.md`, `.planning/phases/01-foundation/01-UI-SPEC.md` — design tokens and components

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/discogs/client.ts`: `isAllowed()` is the write gate to widen (D-06). The request path already handles pacing, headers and error labels.
- `src/server/jobs/handlers/` (`search-spine.ts`, `fetch-release.ts`, `index.ts`): pattern for the new `add_to_collection` handler on the `discogs` lane.
- `src/server/discogs/enqueue.ts`: dedupe-key enqueue pattern for imports and Retry all.
- `src/server/db/schema.ts`: `spines`, `discogsSearches`, `discogsCandidates`. Add the imports table and a not-on-Discogs flag.
- `src/components/candidate-row.tsx`, `candidate-list.tsx`, `discogs-matches.tsx`: where the Add button and "Change match" go.
- `src/components/spines-filter-bar.tsx`: nuqs `useReviewFilter` / `usePhotoFilter` pattern for `?status=`.
- `src/components/search-state-badge.tsx`, `worst-field-badge.tsx`: status-slot badge pattern.
- `src/components/discogs-card.tsx`, `model-select.tsx`: Settings card and select pattern for the folder setting.
- `src/components/ui/alert-dialog.tsx`: duplicate warning dialog.

### Established Patterns
- Pure, unit-tested derivation in `src/lib/` (e.g. `spine-review.ts`, `photo-status.ts`) for the D-10 status function.
- TanStack Query polling of `/api/spines` and `/api/status`.
- Tests use recorded Discogs fixtures and never hit the live API.

### Integration Points
- New routes: `POST /api/spines/{id}/import` (confirm), `POST /api/spines/{id}/import/link-existing`, `POST /api/spines/{id}/not-on-discogs` (mark/unmark), `POST /api/spines/{id}/retry`, optional `POST /api/spines/retry-failed`, `GET /api/discogs/folders`.
- `GET /api/spines` gains review status, import state, and per-status counts. `GET /api/status` can show "Importing · N left".

</code_context>

<specifics>
## Specific Ideas

- About 230 spines are already scanned and searched. The status counts should make it obvious how much of the shelf is left.
- The owner runs on port 3001. Verify the first real import on their account by hand (PITFALLS "verify on a real account"): add one release, check discogs.com, then kill the server mid-import and confirm no duplicate instance appears.

</specifics>

<deferred>
## Deferred Ideas

- Undo import (DELETE the stored `instance_id`): FEATURES differentiator, needs a DELETE in the client.
- Bulk accept and keyboard-driven review.
- Per-spine folder override, and writing notes or shelf location to the Discogs instance.
- "Accept with unverified version" flag.
- Smarter candidate ranking (carried from Phase 3).

</deferred>

---

*Phase: 04-import-review-queue*
*Context gathered: 2026-10-22*
