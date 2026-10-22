---
gsd_state_version: "1.0"
current_phase: 4
current_phase_name: Import & Review Queue
status: executing
stopped_at: Completed 04-12-PLAN.md
last_updated: "2026-10-22T09:53:18.442Z"
last_activity: 2026-10-22
last_activity_desc: Phase 4 execution started
state_head: 25c8c5d5d9541f798b1fd6ff8a5e8a18a5cc28d1
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 49
  completed_plans: 40
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-22)

**Core value:** Photograph a shelf once and get every disc on it reliably into Discogs — with the spine image always visible next to what the AI read, so mistakes are easy to see and fix.
**Current focus:** Phase 4 — Import & Review Queue

## Current Position

Phase: 4 (Import & Review Queue) — EXECUTING
Plan: 6 of 14
Status: Ready to execute
Last activity: 2026-10-22 — Phase 4 execution started

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**
- Total plans completed: 35
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 6 | - | - |
| 02 | 14 | - | - |
| 03 | 15 | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 6min | 3 tasks | 33 files |
| Phase 01 P05 | 16min | 2 tasks | 34 files |
| Phase 01 P06 | 5min | 3 tasks | 10 files |
| Phase 01 P02 | 7min | 3 tasks | 16 files |
| Phase 01 P03 | 5min | 2 tasks | 9 files |
| Phase 01 P04 | 7min | 3 tasks | 15 files |
| Phase 02 P01 | 12min | 2 tasks | 15 files |
| Phase 02 P02 | 34min | 3 tasks | 58 files |
| Phase 02 P03 | 7min | 2 tasks | 16 files |
| Phase 02 P04 | 7min | 2 tasks | 15 files |
| Phase 02 P05 | 12 min | 3 tasks | 16 files |
| Phase 02 P06 | 6 min | 2 tasks | 15 files |
| Phase 02 P07 | 6min | 3 tasks | 10 files |
| Phase 02 P08 | 7 min | 2 tasks | 11 files |
| Phase 02 P09 | 8 min | 2 tasks | 13 files |
| Phase 02 P10 | 13min | 3 tasks | 19 files |
| Phase 02 P11 | 10min | 2 tasks | 17 files |
| Phase 02 P12 | 5min | 3 tasks | 14 files |
| Phase 02 P13 | 2min | 2 tasks | 7 files |
| Phase 02 P14 | 3min | 2 tasks | 5 files |
| Phase 03 P01 | 11min | 3 tasks | 16 files |
| Phase 03 P02 | 8min | 3 tasks | 14 files |
| Phase 03 P03 | 8 min | 1 tasks | 17 files |
| Phase 03 P04 | 7min | 3 tasks | 11 files |
| Phase 03 P05 | 9min | 2 tasks | 14 files |
| Phase 03 P06 | 6min | 2 tasks | 17 files |
| Phase 03 P07 | 10min | 2 tasks | 14 files |
| Phase 03 P08 | 6 min | 1 tasks | 15 files |
| Phase 03 P09 | 6min | 3 tasks | 12 files |
| Phase 03 P10 | 6min | 2 tasks | 9 files |
| Phase 03 P11 | 8 min | 2 tasks | 16 files |
| Phase 03 P12 | 8min | 2 tasks | 14 files |
| Phase 03 P13 | 12h37m | 3 tasks | 1 files |
| Phase 03 P14 | 4min | 2 tasks | 6 files |
| Phase 03 P15 | 4min | 3 tasks | 12 files |
| Phase 04 P01 | 8min | 2 tasks | 14 files |
| Phase 04 P06 | 7min | 2 tasks | 8 files |
| Phase 04 P10 | 5min | 2 tasks | 11 files |
| Phase 04 P02 | 8min | 3 tasks | 12 files |
| Phase 04 P12 | 8min | 2 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 4 coarse phases. Research's Phase 5 was dropped because its v1 items are covered by INGEST-04 (re-scan) and IMP-04 (crash-safe import), and its v1.x items are v2 requirements
- [Roadmap]: The Phase 2 vision schema must be frozen before moving on, because changing it later means paid re-runs
- [Roadmap]: All Discogs HTTP goes through the single throttled gate (DISC-02) from Phase 3's first call site onward
- [Phase 01]: D-06 storage: sqlite-drizzle (better-sqlite3 13 + drizzle 0.45, WAL, migrate at boot)
- [Phase 01]: next.config agentRules:false; typecheck runs next typegen first
- [Phase 01]: server-only works inside the instrumentation graph (A-05 fallback unused)
- [Phase 01]: Owner approved cn@0.5.0 and shadcn@4.22.1 (dev); clsx/tailwind-merge dropped from the approved list (current shadcn registry)
- [Phase 01]: Biome override relaxes 3 rules for vendored src/components/ui only
- [Phase 01]: 01-06: proxy treats malformed/opaque Origin on non-GET/HEAD as foreign (403); missing Origin passes
- [Phase 01]: 01-06: mise cannot install pnpm 12.14.0 (aqua asset mismatch); corepack is the pnpm path
- [Phase 01]: 01-02: complete()/failOrRetry() take an attempt guard so a stale claim cannot overwrite a re-claimed job
- [Phase 01]: 01-02: handlers aborted by worker stop or lease loss write nothing; next lease holder's recovery requeues or fails the job
- [Phase 01]: 01-02: dev jobs route reuses the noop handler's exported NoopPayload schema
- [Phase 01]: 01-03: secrets.json outside DATA_DIR (SECRETS_FILE inside it is refused), 0600 atomic temp+rename, env > file read per call, masked DTOs only
- [Phase 01]: 01-03: SecretsFileError never carries file content (JSON.parse messages suppressed)
- [Phase 01]: 01-04: buildClaudeEnv strips ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and SECRET_ENV_NAMES; every claude spawn runs from os.tmpdir() via runProcess (process-group kill)
- [Phase 01]: 01-04: Vision model stored in settings table key vision_model (Opus 5.5 default, Sonnet 5.5 allowed)
- [Phase 02]: Plan 02-01: VISION_MAX_TURNS stays 6 (CLI 2.1.289 accepts --max-turns)
- [Phase 02]: Plan 02-01: buildClaudeEnv strips inherited Claude Code session vars (CLAUDECODE, CLAUDE_EFFORT, CLAUDE_PID, CLAUDE_CODE_* except CLAUDE_CODE_OAUTH_TOKEN)
- [Phase 02]: Plan 02-01: git.allow_default_branch_commits true (owner chose to commit on master)
- [Phase 02]: Plan 02-02: calibration confirms 1:1 CLI pixel space at 2576/4784 incl. >500 KB JPEG (median error 0.02-0.03%)
- [Phase 02]: Plan 02-02: proposed freeze opus-5-5 high, N 90, W 33 px, confidence 0.6, max output tokens 32000, crop source master, tiling not needed (owner count pending)
- [Phase 02]: Plan 02-02: parseVisionResult keeps non-empty values exactly; non-number confidence becomes 0
- [Phase 02]: Plan 02-03: scan_photo jobs are enqueued with maxAttempts 1 and dedupe scan:<photoId>:<runNo> in the same transaction as the photo and run
- [Phase 02]: Plan 02-03: photos.latest_run_id and spines.current_detection_id carry no FK (circular); hasEarlierScan means an earlier run is done
- [Phase 02]: 02-04 freeze-master: effort high, max output tokens 32000, confidence 0.6, density N 90 / W 33 px, MAX_EDGE 2576 / MAX_TOKENS 4784, crops from full-res master, no tiling
- [Phase 02]: Vision calls run via claude -p on the owner's Claude Max subscription; per-photo $ figures are API-equivalent reporting only (real cost is Max quota)
- [Phase 02]: 02-05: reconcile never retries a paid call - stuck runs are reparsed once from raw.json (dedupe reparse:<runId>, max_attempts 1) or marked error; a failed reparse ends in error
- [Phase 02]: 02-05: D-03 density flags are layout-agnostic warnings (count > N, median short side < W, pair IoU > 0.3, repeated or >20% scattered indexes); every detection kept
- [Phase 02]: PhotoStatusBadge takes a status (server or client waiting/uploading); badgeFor() in src/lib/photo-status.ts is the single status-to-badge mapping reused by 02-07 and 02-08
- [Phase 02]: /upload Photos rows are separated by divide-y so pendingRows can be any ReactNode; the incomplete tooltip counts detectedCount like PhotoDto.truncated
- [Phase 02]: Plan 02-07: unknown non-2xx upload responses map to the network copy (retry is the only useful action)
- [Phase 02]: Plan 02-07: Retry upload only for files actually sent; dropzone-refused files get Remove from list only
- [Phase 02]: Plan 02-07: dropzone root uses role=group with aria-label (react-dropzone default role=presentation drops the label)
- [Phase 02]: 02-08: /spines shows #(index+1); Claude's index is 0-based, use spineNumber() for all #n copy
- [Phase 02]: 02-08: counts.all and the /spines description count the returned (photo-filtered) spines; Needs review = low-confidence spines only until 02-12
- [Phase 02]: isEdited trims both sides and maps empty to null, then compares exactly (no case folding)
- [Phase 02]: Orphaned spines stay editable; superseded and dismissed PATCH returns 409
- [Phase 02]: A failed field save rolls back the query cache but keeps the draft dirty so the next blur retries
- [Phase 02]: Hard to read shows for any illegible detection; Check {field} only when a field is below the threshold
- [Phase 02]: 02-10: MATCH_CUTOFF tuned 0.5 to 0.6 on spike fixtures (rejects a cross-model wrong pair at 0.54); weights stay 0.8 geometry / 0.2 text
- [Phase 02]: 02-10: Re-scan detections are inserted unlinked and mergeRunIntoSpines links them in persistRunResult's immediate transaction; earlier runs are never touched
- [Phase 02]: 02-10: Edited fields keep edit_base_ai_value across a re-scan, cleared only when the value equals the new read
- [Phase 02]: 02-11: re-attach keeps the orphan id, takes the target detection and supersedes the target; detection rows untouched
- [Phase 02]: 02-11: on re-attach an edited field keeps its existing edit_base_ai_value (fallback previous ai_value), matching the 02-10 merge
- [Phase 02]: 02-11: getSpines lists orphans after active spines (orphanedRunNo = first done run after its detection's run); counts.all includes them
- [Phase 02]: 02-11: re-attach candidates use query key reattach-candidates, never a spines-prefixed key (SpineField rewrites those)
- [Phase 02]: 02-12: Needs review counts cover the photo filter and ignore the review filter, so both toggle counts stay visible
- [Phase 02]: 02-12: SpinesResponse.photoOptions lists every photo for the Select, the not-found check and polling
- [Phase 02]: 02-12: rescanHint shows no hint when the latest read is empty (A-18)
- [Phase 02]: Retry a failed poll every 3 s (POLL_RETRY_MS) when no photo is active; active polling stays 1.5 s (G-02-3)
- [Phase 02]: photosRefetchInterval status parameter is required so typecheck catches non-error-aware call sites
- [Phase 02]: Field blur commits are deferred with setTimeout 0 (createFieldCommit) so Escape cancels them in either event order; no skip flag (G-02-5)
- [Phase 02]: A pending field save is flushed on SpineField unmount, not dropped
- [Phase 03]: Discogs auth 'oauth' uses the stored token and is the only mode whose 401 sets the auth-invalid flag; connect uses 'request' with explicit tokens
- [Phase 03]: Verify builds go to NEXT_DIST_DIR (.next/verify) so the owner's running next start on .next is never rebuilt
- [Phase 03]: A successful Test connection clears the in-memory auth-invalid flag (clearAuthInvalid), so Reconnect needed cannot contradict Connection works
- [Phase 03]: Clearing a Discogs consumer value clears the sign-in and any pending connect
- [Phase 03]: Connect failures for busy and credentials_missing use plain-language reasons in the UI-SPEC Other template
- [Phase 03]: search_spine searches the inputs stored on the search row at enqueue time, so input_hash always describes what Discogs was asked
- [Phase 03]: finishSearch is compare-and-set on queued; auto candidates are replaced only by the run that finished the row
- [Phase 03]: discogsReady() never throws: an unreadable secrets file means no auto searches, never a failed scan
- [Phase 03]: Paste-code finish route reads the pending entry without consuming it (readPendingConnect) and drops it only on success or the 5th rejected code
- [Phase 03]: Finish route failure reasons are fixed plain-language strings; Discogs error messages can name /oauth paths
- [Phase 03]: Settings callback URL is built with callbackUrlFor(Host) from next/headers, shared with the connect route
- [Phase 03]: An orphaned spine skips only automatic searches; an explicit Search again on it still runs
- [Phase 03]: A search ending not_connected or auth_failed releases its job's dedupe key so a later connect can queue it again
- [Phase 03]: Retry-After accepts only delta-seconds and the three RFC 9110 HTTP-date forms; anything else falls back to the 60 s pause
- [Phase 03]: Cover URLs are fetched only when protocol and host (incl. port) equal imageBase(); covers skip the API pacing gate but cap at 4 concurrent downloads, one per URL
- [Phase 03]: discogsStatus treats an unreadable secrets file as not connected so /api/status never 500s
- [Phase 03]: Header failed suffix counts anthropic jobs only; Discogs failures are spines whose latest auto/again search failed (tooltip only)
- [Phase 03]: 03-07: enqueueAutoSearch's same-hash baseline is the newest auto/again search not ended not_connected/auth_failed (A-03-27); the maintenance backfill never re-picks auth_failed or failed spines
- [Phase 03]: 03-07: Discogs strings are capped in code points (capCodePoints), never splitting a surrogate pair
- [Phase 03]: 03-08: stored candidates win over Not searched / No matches; a done search with zero stored candidates reads as No matches
- [Phase 03]: 03-08: Discogs summaries cover every listed spine (before the review filter) so discogsActive keeps polling for hidden spines
- [Phase 03]: 03-09: candidates route lists only active/orphaned spines; unknown, superseded, dismissed share the 404 NOT_FOUND body
- [Phase 03]: 03-09: Show all fetches ['discogs-candidates', spineId] only when opened; spinesRefetchInterval is the single /spines polling rule (fastest applicable wins)
- [Phase 03]: fieldsChanged ignores a latest search that ended not_connected or skipped (it never reached Discogs)
- [Phase 03]: Explicit searches (Search again/Retry) use dedupe key search:{searchId}; busy and state checks run inside the same IMMEDIATE transaction
- [Phase 03]: search_spine never replaces auto candidates for a manual search; manual inputs carry only rawText until Plan 03-12's manual branch
- [Phase 03]: addManualCandidate copies from the spine's own done manual/release search results and upserts on (spine, manual, release) so re-adding moves it to the top
- [Phase 03]: A manual dialog search sends one CD-only GET /database/search of 25 and never writes discogs_candidates; an empty stored query fails without a request
- [Phase 03]: Dialog result covers resolve their URL from the search's stored results_json (manual and release searches only), never the request
- [Phase 03]: The dialog's polite status announces only done ('{n} results') and no_match; not-found and failed are visible text
- [Phase 03]: Live run: Discogs honours the per-request callback (A1) and the standard exchange signature (A2); 97% of real candidates carry covers (A5); A3 not exercised (no 429)
- [Phase 03]: 03-14: an UNSEARCHED latest search over a baseline covering current inputs shows the baseline outcome (effectiveSearch)
- [Phase 03]: 03-14: UNSEARCHED_STATUSES/NON_BASELINE_STATUSES in store.ts are the one shared status rule; SQL lists built from typed constants
- [Phase 03]: 03-15: CR-01 rule (a): a connect or passing Test connection replays an auth_failed latest search even over a covering baseline; dedupe key carries the rejected search id; maintenance hook never does (T-03-17)
- [Phase 03]: 03-15: A passing Test connection always runs the includeAuthFailed backfill (the rejection flag is in-memory and lost on restart)
- [Phase 03]: 03-15: A not_searched card shows neither Fields changed nor Search again (showsFieldsChanged, WR-01)
- [Phase 04]: 04-01: The Discogs add POST is allowed only with auth oauth and when the path's username segment equals the encoded stored username; refused before fetch otherwise
- [Phase 04]: 04-01: Until Plan 04-02, add_to_collection records every non-429 request error on the imports row and rethrows; terminal ends (removed, auth, already_in_collection) release the dedupe key
- [Phase 04]: 04-01: A duplicate instance id when recording a POSTed copy fails the import instead of retrying
- [Phase 04]: 04-01: enqueueImport opens its own IMMEDIATE transaction (a savepoint inside createImport's)
- [Phase 04]: 04-06: setCollectionFolderId refuses any id when no folder list is cached, even 1
- [Phase 04]: 04-06: a folder refresh 403 maps to rejected like a 401; a malformed folder list is a DiscogsRequestError with a safe reason
- [Phase 04]: 04-06: saveCollectionFolder returns the bare reason; the field wraps it in the UI-SPEC Not saved sentence
- [Phase 04]: Import read model: a pending or importing import whose job failed, was cancelled or is missing reads failed (interrupted unless an error_kind is recorded)
- [Phase 04]: ImportDto.candidateId is null once the confirmed candidate row no longer exists; the panel falls back to Release {id}
- [Phase 04]: Phase 4 verify helpers and ImportFakeState live in scripts/lib/import-flow.ts; new fake-state fields go there
- [Phase 04]: 04-02: a 404 on the collection read ends an import rejected; only a 404 on the add is not_found (the read answers 200 empty for an unknown release)
- [Phase 04]: 04-02: markInterruptedImports runs as a maintenance hook and keeps an earlier error_kind/error via COALESCE, else stores interrupted with the UI-SPEC line
- [Phase 04]: 04-12: retrySpine returns the same job for a waiting import (idempotent Retry); only a running or importing import answers busy
- [Phase 04]: 04-12: retrySpine answers nothing_to_retry for imported or already_in_collection imports, superseded or dismissed spines, and spines marked not on Discogs

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: Light research. Verify folder-0 POST behaviour and duplicate-instance creation on a real account

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-22T09:53:18.219Z
Stopped at: Completed 04-12-PLAN.md
Resume file: None
