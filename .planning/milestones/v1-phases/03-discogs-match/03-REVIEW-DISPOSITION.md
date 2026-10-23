---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "An orphaned or non-CD spine whose search was rejected is never replayed, and its card still says \"Reconnect Discogs in Settings\" after a successful reconnect"
  - id: WR-02
    severity: warning
    disposition: open
    title: "After a restart, the card copy \"Reconnect Discogs in Settings\" points to a button that does not exist"
  - id: IN-01
    severity: info
    disposition: open
    title: "A stray JSDoc block now sits directly above `showsFieldsChanged`"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "A spine whose auto search ended `skipped` is never auto-searched again, while the UI says it is \"waiting its turn\""
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
unparsed: 4
recorded: 2026-10-22T01:09:32.384Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| CR-01 | critical | fixed | 03-REVIEW-FIX.md (not in the current review) |
| IN-02 | info | open | - (not in the current review) |
| IN-03 | info | open | - (not in the current review) |
| IN-04 | info | open | - (not in the current review) |
| WR-03 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-05 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| IN-05 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
