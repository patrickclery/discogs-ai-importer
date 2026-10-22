---
phase: 04
review: 04-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Change match on a failed-with-intent import is reachable only through a Retry that POSTs the release the owner wants to drop"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Re-scan merge, Dismiss and re-attach treat a failed import with a written intent as closed, which hides a copy that may be on Discogs"
  - id: WR-02
    severity: warning
    disposition: open
    title: "retrySpine retries an import on a spine the owner marked \"not on Discogs\""
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Marking \"not on Discogs\" is allowed while a failed import may already be on Discogs"
  - id: WR-04
    severity: warning
    disposition: open
    title: "The adopt rule's time guard produces false negatives, and for allow_duplicate imports that means a second POST"
  - id: WR-05
    severity: warning
    disposition: open
    title: "A local \"Add another copy\" is held as already_in_collection while the other spine's add is still unresolved"
  - id: WR-06
    severity: warning
    disposition: open
    title: "A spine with a held or waiting import and an older failed search reads \"Failed\", and Retry all failed cannot clear it"
  - id: IN-01
    severity: info
    disposition: open
    title: "post_count and intent_at are written when no POST is sent"
  - id: IN-02
    severity: info
    disposition: open
    title: "A 403 does not mark the sign-in invalid"
  - id: IN-03
    severity: info
    disposition: open
    title: "A secrets-file error in the pre-checks becomes a retry, then \"interrupted\""
  - id: IN-04
    severity: info
    disposition: open
    title: "Store functions take a `db` but write through the global connection"
  - id: IN-05
    severity: info
    disposition: open
    title: "Silent fallbacks in the folder list and Retry all failed"
open: 11
total: 12
recorded: 2026-10-22T20:51:55.928Z
---

# Phase 04: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | fixed | 04-REVIEW-FIX.md |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
