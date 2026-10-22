---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "After a reconnect, an auth_failed search is never re-picked when the baseline covers the inputs, and the card keeps saying \"Reconnect Discogs\""
  - id: WR-01
    severity: warning
    disposition: open
    title: "A not-searched card can show \"Fields changed\" and \"Search again\" while it also says the spine is waiting its turn"
  - id: IN-01
    severity: info
    disposition: open
    title: "`latestAutoSearch` is dead production code whose doc names it the baseline"
  - id: IN-02
    severity: info
    disposition: open
    title: "The invariant test's \"waiting line\" half is a tautology"
  - id: IN-03
    severity: info
    disposition: open
    title: "The unsearched membership check and the status lists in doc comments are repeated by hand"
  - id: IN-04
    severity: info
    disposition: open
    title: "Test helpers are duplicated across the two new test suites"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "A rate-limit pause can make a running search time out and spend an attempt (violates D-06)"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Saving a new consumer key while connected keeps the old token, but clearing the key disconnects"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "A successful Test connection clears \"Reconnect needed\" but leaves every `auth_failed` spine failed"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "/spines reports \"connected\" while explicit searches are refused as not connected"
  - id: IN-05
    severity: info
    disposition: open
    title: "`useNowUntil` duplicates `useSecondsUntil`"
open: 7
total: 11
recorded: 2026-10-22T00:27:33.248Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| WR-02 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-05 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| IN-05 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
