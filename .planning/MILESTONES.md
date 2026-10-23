# Milestones

## v1 MVP (Shipped: 2026-10-23)

**Delivered:** Photograph a CD shelf, get every spine read by one Claude call, matched on Discogs, reviewed, and added to the owner's collection exactly once.

**Phases completed:** 4 phases, 50 plans, 111 tasks
**Timeline:** 2026-10-18 → 2026-10-23 (400 commits)
**Code:** ~25k lines TypeScript app code, ~23k lines tests (1606 Vitest tests)
**Closeout:** override_closeout

**Key accomplishments:**
- Portable local app on 127.0.0.1: SQLite data folder migrated at boot, lease-gated durable job queue that survives kill -9 and dev hot reload, secrets kept outside the data folder.
- One headless `claude -p` vision call per photo (on the owner's subscription), HEIC/EXIF-normalized images, raw answers saved before parsing, and horizontal spine crops cut locally.
- Editable review list with Claude's original read kept alongside, re-scan that preserves edits, and orphan re-attach/dismiss.
- Discogs OAuth 1.0a with a single paced, 429-aware gate; automatic catalog-number → artist/title → free-text search, manual search and paste-a-release-ID.
- Explicit confirm-to-import into a chosen folder, exactly once across crashes, timeouts and retries (intent before POST, adopt a copy that already landed); duplicate and already-in-collection warnings.
- Status-driven queue (pending, matched, imported, not found, not on Discogs, failed) with counts, retry, retry-all and "not on Discogs".

**Known verification overrides:** 9 newly acknowledged, 0 carried forward
- Phases 1–3: VERIFICATION.md status passed but covered-file fingerprints stale (later phases edited shared files); owner declared them done and the v1 audit re-confirmed their requirements in current code.
- Phase 4: 4 owner overrides in 04-VERIFICATION.md (WR-06 status rule, CR-01 check-only Change match ×2, UAT test 5 accepted without a browser check).
- 5 diagnosed debug sessions acknowledged as deferred (see STATE.md Deferred Items).

**Known tech debt:** see `milestones/v1-MILESTONE-AUDIT.md` (undo import deferred, match ranking, migrations only at boot, Phase 2 backlog 999.1–999.4).

---
