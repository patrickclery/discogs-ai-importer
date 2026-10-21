---
phase: 03-discogs-match
plan: 06
subsystem: api
tags: [discogs, thumbnails, sharp, sqlite, status, react]

requires:
  - phase: 03-discogs-match
    provides: "Plan 03-01: imageBase(), DISCOGS_USER_AGENT, discogsGate().pausedUntil(), getDiscogsAuth(); Plan 03-03: discogs_candidates.thumb_url, discogs_searches (kind, status, job_id)"
provides:
  - src/server/discogs/thumbs.ts ensureThumb/thumbKey/isAllowedImageUrl/THUMB_MAX_BYTES (cover cache under DATA_DIR/discogs-thumbs)
  - GET /api/discogs/thumb/{candidateId} (307 to /api/files/discogs-thumbs/{sha256}.webp, else 404 nosniff)
  - discogs-thumbs in SUBDIRS and the /api/files ROOTS allowlist
  - discogsStatus() and StatusResponse.discogs { connected, backlog, pausedUntil, failedSpines }
  - src/lib/status-text.ts headerInputs/headerParts/discogsTooltipLines/partsText
  - StatusIndicator Discogs header segment, anthropic-only failed suffix, paused countdown
affects: [03-08, 03-11, 03-13, 04]

actuals:
  tokens: 14427
  tasks: 2
  commits: 3

plan_head_before: 3626c5213fae664609a4de7b330f710337e429ca
plan_head_after: 542f3b35d8bdc0e4ad50874e47e5f7043b2904a2

tech-stack:
  added: []
  patterns:
    - "Process-wide in-flight Map plus a hand-off semaphore on globalThis, so concurrent cover requests share one download and dev HMR does not duplicate state"
    - "Pure client-safe text helpers return string | number parts; the component renders numbers in the mono Num"
    - "A status read that touches secrets.json swallows read errors (not connected) so the 5 s poll never 500s"

key-files:
  created:
    - src/server/discogs/thumbs.ts
    - src/server/discogs/thumbs.test.ts
    - src/app/api/discogs/thumb/[id]/route.ts
    - src/app/api/discogs/thumb/[id]/route.test.ts
    - src/server/discogs/status.ts
    - src/server/discogs/status.test.ts
    - src/lib/status-text.ts
    - src/lib/status-text.test.ts
    - .planning/phases/03-discogs-match/tdd-evidence/03-06-task2-text-red.json
    - .planning/phases/03-discogs-match/tdd-evidence/03-06-task2-status-red.json
  modified:
    - src/app/api/files/[...path]/route.ts
    - src/server/storage/paths.ts
    - src/server/storage/paths.test.ts
    - scripts/verify-skeleton.ts
    - src/lib/status-types.ts
    - src/app/api/status/route.ts
    - src/components/status-indicator.tsx

key-decisions:
  - "A cover URL is allowed only when its protocol and host (hostname and port) equal imageBase() and it has no userinfo; under the DISCOGS_IMAGE_BASE test override, i.discogs.com itself is refused"
  - "Cover downloads skip the API pacing gate (A-03-18) but share a cap of 4 concurrent downloads and one in-flight download per URL"
  - "The paused countdown pluralizes ('1 second') to follow the zero-one-many rule; the UI-SPEC copy only shows the plural"
  - "discogsStatus treats an unreadable secrets file as not connected instead of letting /api/status fail"

patterns-established:
  - "Route tests for the cover route import the /api/files GET handler directly to prove the new root is allowlisted and still refuses dot segments and other types"

requirements-completed: [DISC-04, DISC-02]

coverage:
  - id: D1
    description: "A candidate's cover is downloaded once from i.discogs.com, stored as a WebP of at most 128 px under data/discogs-thumbs/{sha256}.webp and served from the cache afterwards without a fetch"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "src/server/discogs/thumbs.test.ts#downloads once, stores a WebP of at most 128 px and then serves the cache"
        status: pass
      - kind: integration
        ref: "src/app/api/discogs/thumb/[id]/route.test.ts#307 to /api/files/discogs-thumbs/{key}.webp for a cached cover, no fetch"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only https i.discogs.com (or the override host) is fetched, redirects are refused, and http, look-alike hosts, userinfo, other ports, data: URLs, non-image types, non-200 answers and undecodable bytes give null / 404"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "src/server/discogs/thumbs.test.ts#refuses %s without a fetch; refuses a text/html answer; refuses bytes sharp cannot decode"
        status: pass
      - kind: integration
        ref: "src/app/api/discogs/thumb/[id]/route.test.ts#404 without a fetch for a stored URL off the image host"
        status: pass
    human_judgment: false
  - id: D3
    description: "A cover body of exactly 2 097 152 bytes is accepted and one byte more is refused, from Content-Length or from the streamed body"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "src/server/discogs/thumbs.test.ts#accepts a streamed body of exactly the limit; refuses a streamed body one byte over; Content-Length cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "Concurrent first requests for one cover share one download and at most 4 downloads run at once"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "src/server/discogs/thumbs.test.ts#shares one download; runs at most 4 downloads at once"
        status: pass
    human_judgment: false
  - id: D5
    description: "/api/files serves discogs-thumbs as .webp and still refuses ../app.db, .png, other roots and paths outside DATA_DIR; ensureDataDirs creates discogs-thumbs and the data-folder proofs still pass"
    verification:
      - kind: integration
        ref: "src/app/api/discogs/thumb/[id]/route.test.ts#/api/files serves the cached cover; /api/files refuses %j with 404"
        status: pass
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-scan.ts; VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts; VERIFY_SKIP_BUILD=1 node scripts/verify-portability.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /api/status gains discogs { connected, backlog, pausedUntil, failedSpines }; failedSpines counts active or orphaned spines whose latest auto/again search failed, so a successful retry stops counting"
    requirement: DISC-02
    verification:
      - kind: integration
        ref: "src/server/discogs/status.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Header text table, mono numbers, anthropic-only failed suffix, pluralized tooltip failures, 'not connected' line and the paused countdown line"
    requirement: DISC-02
    verification:
      - kind: unit
        ref: "src/lib/status-text.test.ts (19 tests)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The live countdown ticks each second in the tooltip while paused, the header text fits beside the navigation at 1024px and 1280px, and below 640px only the dot shows"
    requirement: DISC-02
    verification: []
    human_judgment: true
    rationale: "Live countdown behaviour and header fit at different window widths are visual (Task 2 human-check)"

duration: 6min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 06: Cover Cache and Discogs Header Status Summary

**Candidate covers are downloaded once from i.discogs.com, re-encoded as a 128 px WebP in `data/discogs-thumbs/` and served from there through the allowlisted `/api/files`. The header now shows how many Discogs lookups are left, says when Discogs has paused the app and counts down to the restart. It counts Discogs failures per spine (latest search only), so a successful retry stops counting.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-21T01:51:51Z
- **Completed:** 2026-10-21T01:58:17Z
- **Tasks:** 2 (1 tracer, 1 TDD)
- **Files modified:** 17

## Accomplishments
- `ensureThumb(url)` only fetches URLs whose protocol and host match `imageBase()`, and it refuses redirects. It enforces a 10 s timeout and a 2 MB cap, checked on Content-Length and again on the streamed body. It needs an `image/*` content type and a sharp decode, then writes the WebP atomically. One download runs per URL, and at most 4 run at once. A failure logs only the host and the failure type.
- `GET /api/discogs/thumb/{candidateId}` reads `thumb_url` from the database by id and redirects 307 to the cached file. When it cannot, it returns the files-route 404 with nosniff, so the row shows its placeholder.
- `/api/status` reports `discogs { connected, backlog, pausedUntil, failedSpines }`. The header follows the UI-SPEC text table, the dot pulses while any work is pending, and the red "failed" suffix now counts only Claude jobs.

## Task Commits

1. **Task 1: Tracer, a candidate's cover is downloaded once, cached in the data folder and shown from there** - `d03555d` (feat)
2. **Task 2: The header shows Discogs lookups left and the slow-down pause** (TDD)
   - RED: `0da327c` (test)
   - GREEN: `542f3b3` (feat)

## TDD Gate Compliance

- **RED:** `status-text.test.ts > headerParts > {"a":0,"d":34,"paused":false} reads Searching Discogs · 34 left` failed with "expected '' to be 'Searching Discogs · 34 left'" against the empty skeleton. `status.test.ts > discogsStatus > does not count a spine whose newer again search succeeded` failed with "expected -1 to be 0". Both were rerun with `-t` and `--reporter=tap-flat`, and the classifier returned `RED_EVIDENCE_OK` (target_test_failed) for both. Semantic check: each target ran and failed on its planned assertion, with no load or fixture fault. Evidence: `tdd-evidence/03-06-task2-text-red.json` and `tdd-evidence/03-06-task2-status-red.json`. The first capture targeted a `toEqual` array test. Its multi-line diff broke TAP (`invalid_record`), so it was recaptured on a `toBe` target.
- **GREEN:** all 30 tests pass.
- **REFACTOR:** none needed.

## Files Created/Modified
- `src/server/discogs/thumbs.ts` - cover cache: allowlist, caps, sharp re-encode, atomic write, dedupe and semaphore
- `src/app/api/discogs/thumb/[id]/route.ts` - cover by candidate id
- `src/app/api/files/[...path]/route.ts`, `src/server/storage/paths.ts` - the `discogs-thumbs` root and data subfolder
- `scripts/verify-skeleton.ts` - the data-folder check expects `discogs-thumbs/`
- `src/server/discogs/status.ts`, `src/lib/status-types.ts`, `src/app/api/status/route.ts` - the Discogs part of `/api/status`
- `src/lib/status-text.ts` - pure header and tooltip text
- `src/components/status-indicator.tsx` - Discogs segment, Claude-only failed suffix, 1 s countdown only while paused

## Decisions Made
- The host check compares the protocol and the full host (including the port) with `imageBase()` and rejects URLs that carry a username or password. While the test override is set, the real i.discogs.com host is refused.
- The countdown line uses the singular for 1 ("1 second"), following the zero-one-many rule.
- `discogsStatus` reports "not connected" when the secrets file cannot be read, so the 5 s status poll cannot fail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] /api/status could fail on an unreadable secrets file**
- **Found during:** Task 2
- **Issue:** `getDiscogsAuth()` throws when secrets.json is malformed. Calling it directly in `/api/status` would turn every header poll into a 500.
- **Fix:** `discogsStatus` wraps the call and reports `connected: false`.
- **Files modified:** src/server/discogs/status.ts
- **Verification:** `status.test.ts > reports not connected, without throwing, when the secrets file is unreadable`
- **Committed in:** 542f3b3

**2. [Rule 2 - Missing Critical] verify-skeleton did not check the new data subfolder**
- **Found during:** Task 1
- **Issue:** The data-folder layout proof hard-codes the folder list, so it would never notice a missing `discogs-thumbs/`.
- **Fix:** Added `discogs-thumbs` to its list.
- **Files modified:** scripts/verify-skeleton.ts
- **Verification:** `VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts` passes
- **Committed in:** d03555d

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Small and needed for correctness. No scope creep.

## Issues Encountered
- Vitest's multi-line `toEqual` diff breaks TAP parsing for the RED classifier. The evidence was recaptured on a `toBe` target, as in 03-05.

## Verification
- `corepack pnpm test` (703 tests), `typecheck` and `lint` exit 0
- `NEXT_DIST_DIR=.next/verify node scripts/verify-scan.ts` (fresh build) passes, followed by `VERIFY_SKIP_BUILD=1` runs of `verify-skeleton.ts` and `verify-portability.ts`, which also pass

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 03-08's `CandidateThumb` can request `/api/discogs/thumb/{candidateId}` and fall back to its placeholder on any non-image answer.
- The owner checkpoint (Plan 03-13) still needs to confirm A-03-16, that real search results carry i.discogs.com thumb URLs, and to check the header visually (D8).

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED
