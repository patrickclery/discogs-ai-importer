---
milestone: v1
audited: 2026-10-23T01:00:00Z
status: tech_debt
scores:
  requirements: 28/28
  phases: 4/4
  integration: 11/11
  flows: 11/11
gaps:
  requirements: []
  integration: []
  flows: []
tech_debt:
  - phase: 04-import-review-queue
    items:
      - "Deferred (owner, D-02 / DATA-01): no Undo import or Change match after a successful import; a wrong-match add must be removed by hand on discogs.com (UAT test 3, .planning/debug/wrong-match-import-recovery.md)"
      - "Ranking: catalog-number-only matches rank above an artist+title+catno match (src/server/discogs/search.ts rankCandidates keeps Discogs order inside the exact-catno group)"
      - "Fragile: isInstanceTaken (src/server/jobs/handlers/add-to-collection.ts) detects a duplicate instance id by matching SQLite's error text 'imports.instance_id'"
      - "Adoption / Change match end as failed when the owner holds more than one page of copies of a release; owner must step in via Retry"
      - "04-REVIEW IN-01..IN-05 and 04-15-REVIEW IN-01/IN-02 info findings open (truncated photo names readable on hover only; title may double-announce in screen readers)"
      - "UAT test 5 (card buttons at phone width in Waiting / Already in collection / Import failed) accepted by override without a browser check"
  - phase: 02-shelf-scan
    items:
      - "Backlog 999.1: rotate tilted spine crops to perfectly horizontal (UAT test 4)"
      - "Backlog 999.2: photo filter dropdown not reachable without scrolling to the top (UAT test 9)"
      - "Backlog 999.3: manual browser check of orphan Re-attach / Dismiss spine (UAT test 3; automated coverage exists)"
      - "Backlog 999.4: manual check of Re-scan from a failed upload row, narrow-window Re-scan icon, Use new read (UAT test 5)"
  - phase: cross-phase
    items:
      - "Ops: migrations run only at server boot; a dev server started before a schema change serves errors until restarted (hit during Phase 4 UAT). A startup/health check of the applied migration count would catch it"
      - "Phases 1–3 VERIFICATION.md fingerprints are stale (later phases edited shared files); owner considers them done. Integration check re-confirmed all their requirements in the current code (tsc clean, 1606/1606 tests)"
      - "Phase 1 has no SECURITY.md"
nyquist:
  compliant_phases: [1, 2, 3, 4]
  partial_phases: []
  not_validated_phases: []
  missing_phases: []
  overall: compliant
---

# Milestone v1 Audit

**Status:** tech_debt. All requirements are met and nothing blocks; the debt below is deferred, not broken.

This replaces the 2026-10-21 audit (gaps_found, 20/28), which ran before Phase 4 was built and before Phase 3 was re-verified.

## Requirements (3-source cross-check)

| Group | IDs | VERIFICATION | SUMMARY | REQUIREMENTS.md | Final |
|-------|-----|--------------|---------|-----------------|-------|
| Foundation (P1) | FOUND-01..04 | passed | listed | [x] | satisfied |
| Ingest / Vision / Review (P2) | INGEST-01..05, VIS-01..04, REV-01..02 | passed | listed | [x] | satisfied |
| Discogs match (P3) | DISC-01..06 | passed | listed | [x] | satisfied |
| Import & review queue (P4) | IMP-01..04, REV-03..05 | passed (4 owner overrides) | listed | [x] | satisfied |

No orphaned or unsatisfied requirements.

## Phases

| Phase | Verification | Nyquist | Security |
|-------|--------------|---------|----------|
| 1 Foundation | passed (fingerprint stale) | compliant | no SECURITY.md |
| 2 Shelf Scan | passed, 1 override (fingerprint stale) | compliant | 0 open |
| 3 Discogs Match | passed (fingerprint stale) | compliant | 0 open |
| 4 Import & Review Queue | passed 2026-10-23, 4 overrides, UAT complete | compliant | 0 open |

## Integration (11/11) and flows (11/11)

All Phase 4 wiring into Phases 1–3 is present: import jobs on the durable queue and throttled Discogs lane (429 waits without spending an attempt); restart-safe imports (intent before POST, adopt-on-retry, interrupted-import sweep); re-scan keeps spines whose import may be on Discogs; review status and filter counts in the spine query; not-on-Discogs blocks search/add/retry; cross-photo duplicate dialog; already-in-collection link/another; retry routes; check-only Change match; folder picker. Migration 0003 is applied at boot via instrumentation → bootServer → runMigrations.

Flows traced: upload → scan → search → confirm → import; restart mid-import; re-scan after import; duplicate across photos; already in collection; retry failed search; retry failed import; not on Discogs; Change match; status filter; settings and OAuth.

## Tech debt

See frontmatter `tech_debt` (12 items across Phase 4, Phase 2 backlog, and cross-phase ops).
