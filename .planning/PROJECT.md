# Discogs AI Importer

## What This Is

A local, portable web app that turns photos of CD shelves into Discogs collection entries. The user drags and drops photos of disc spines; Claude (via the owner's subscription and the local Claude Code CLI) reads every spine in a photo in a single vision call; each detected spine is cropped, stored locally (SQLite), matched against the Discogs database, reviewed/corrected by the user, and added to their Discogs collection. Built for a single user (the owner) cataloguing their own physical media.

## Core Value

Photograph a shelf once and get every disc on it reliably into Discogs — with the spine image always visible next to what the AI read, so mistakes are easy to see and fix.

## Requirements

### Validated

- ✓ User can drag and drop one or more shelf/spine photos into the web UI — Phase 2
- ✓ Each uploaded photo is processed with exactly ONE Claude vision API call that returns all spines in the photo as structured JSON (artist, title, format, catalog number / label if visible, bounding box per spine) — Phase 2
- ✓ Each detected spine is cropped locally (sharp) from its bounding box and stored as its own image — no additional AI calls for cropping — Phase 2
- ✓ Duplicate uploads are detected by image hash and not re-sent to Claude; re-scanning a photo only happens on explicit user action — Phase 2
- ✓ All photos, spine crops, and extracted data are stored locally (SQLite + files on disk) so the whole thing is portable — Phase 2
- ✓ Every item in the list shows its spine crop next to the extracted text — Phase 2
- ✓ User can edit/correct the extracted fields, with the AI read kept alongside — Phase 2
- ✓ User can connect their Discogs account via OAuth 1.0a — Phase 3
- ✓ For each spine, the app searches Discogs and proposes candidate releases (with cover thumbnails) for the user to confirm — Phase 3
- ✓ Discogs requests are queued/throttled to respect the 60 req/min authenticated rate limit — Phase 3
- ✓ User can re-run the Discogs search for a spine after correcting it (field editing itself shipped in Phase 2) — Phase 3
- ✓ User can configure their Discogs app credentials locally; Claude access uses their existing Claude subscription via the local Claude Code CLI (no API key) — Phase 3

- ✓ User confirms a match and the release is added exactly once to their chosen Discogs collection folder (restart- and retry-safe, instance id recorded) — v1 (Phase 4)
- ✓ User sees every spine with a status (pending, matched, imported, not found, not on Discogs, failed), filters by it with counts, and retries failures — v1 (Phase 4)
- ✓ Items with no Discogs match can be flagged "not on Discogs" — v1 (Phase 4)
- ✓ User is warned when a release is already in their collection or already imported from another spine — v1 (Phase 4)

### Active

- [ ] Undo an import / change the match after a wrong add succeeded (remove the copy from Discogs and free the card) — deferred from v1 (D-02, DATA-01)
- [ ] Rank artist + title + catalog-number matches above catalog-number-only matches
- [ ] Phase 2 follow-ups (backlog 999.1–999.4): straighten tilted spine crops; reach the photo filter without scrolling up; browser checks of orphan re-attach/dismiss and failed-row re-scan

### Out of Scope

- Creating new releases on Discogs — the Discogs API does not support release submission; only existing releases can be added to a collection
- DVDs, Blu-rays and any non-CD media — the collection being imported is CDs only; non-CD spines in a photo are ignored
- Multi-user / hosted deployment — this is a personal local tool
- Marketplace listing / selling — collection only
- One Claude call per spine — explicitly rejected for cost; one call per photo

## Context

**Current state (v1 shipped 2026-10-23):** about 25k lines of TypeScript app code plus 23k lines of tests (1606 Vitest tests) on Next.js 16, SQLite/Drizzle, sharp and the Claude Code CLI. The owner has run real imports against their Discogs account. Known debt is listed in `.planning/milestones/v1-MILESTONE-AUDIT.md`. Notable ops lesson: migrations run only at server boot, so a long-running dev server must be restarted after a schema change.

- Physical CD collection, photographed as spines on shelves (many spines per photo).
- Discogs API: search (`/database/search`) requires authentication; adding to collection is `POST /users/{username}/collection/folders/{folder_id}/releases/{release_id}`. Rate limit 60/min authenticated.
- Claude vision with structured output (tool use / JSON schema) can return an array of spines with bounding boxes from one image.
- Spine text is often vertical, small, stylized — expect OCR errors, hence the correction UI is central, not optional.

## Constraints

- **Tech stack**: Next.js (App Router, TypeScript) — user's choice for the UI
- **Storage**: SQLite (preferred for portability); Postgres acceptable but not default
- **Cost**: Exactly one Claude vision call per uploaded photo; no per-spine AI calls; cache by image hash
- **Rate limits**: Discogs 60 req/min authenticated — must queue
- **Portability**: Whole app state (DB + images) lives in the project/data folder and can be copied elsewhere
- **Billing**: Vision must run on the user's Claude subscription (Claude Code CLI), never API credits; usage counts against subscription limits
- **Secrets**: API keys stored locally (.env or local settings), never committed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite (via Drizzle) over Postgres | Portability; single-user local tool | ✓ Good (Phase 2) |
| Claude vision, one call per photo returning all spines + bounding boxes | Avoid N calls per photo; cost control | ✓ Good (Phase 2) |
| Local cropping with sharp from AI bounding boxes | Spine images for review without extra AI calls | ✓ Good (Phase 2) |
| Human confirms Discogs match before adding to collection | OCR + search is fuzzy; avoid polluting collection | ✓ Good (v1) |
| Use Claude subscription via headless `claude -p` CLI instead of API key | User doesn't want to pay for API credits | ✓ Good (Phase 2) |
| Image-hash dedup; re-scan only on explicit action | Prevent accidental repeat API spend | ✓ Good (Phase 2) |
| Re-scan merges into existing spines: edited values kept, unmatched edited spines become orphans (re-attach or dismiss), never deleted | Owner edits must survive a re-read | ✓ Good (Phase 2) |
| CDs only — no DVD/film handling, no music/film `kind` field; Discogs search uses `format=CD` (supersedes research notes on DVDs) | User has no music DVDs; movie DVDs aren't on Discogs (2026-10-19) | ✓ Good (Phase 3) |
| Thin in-house Discogs client (PLAINTEXT OAuth, one paced gate ~1 req/s, read-only until Phase 4) | Own the rate-limit queue; client refuses writes so nothing reaches the collection before review | ✓ Good (Phase 3) |
| No automatic match preselect — owner always picks | Fuzzy search; avoid wrong collection entries | ✓ Good (Phase 3) |
| Write an import intent before the Discogs POST and adopt a copy that already landed on retry | Exactly-once adds across crashes, timeouts and 5xx | ✓ Good (v1, UAT kill-mid-import passed) |
| Undo after a successful import deferred (D-02) | Keep v1 scope; wrong adds are rare and fixable on discogs.com | ⚠️ Revisit (owner hit it in UAT) |
| Failed import's Change match runs a check-only job instead of locking the card (CR-01) | Frees the card without risking a second copy | ✓ Good (v1) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-23 after v1 milestone*
