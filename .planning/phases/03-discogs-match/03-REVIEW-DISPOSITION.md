---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "A spine whose auto search ended `skipped` is never auto-searched again, while the UI says it is \"waiting its turn\""
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Three different \"baseline\" rules plus a permanent auto dedupe key cause stuck spines, a write lock on every lease tick, and stale candidates shown as current"
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
  - id: IN-01
    severity: info
    disposition: open
    title: "Orphaned JSDoc block"
  - id: IN-02
    severity: info
    disposition: open
    title: "Duplicated handler scaffolding and route boilerplate"
  - id: IN-03
    severity: info
    disposition: open
    title: "Owner-facing reasons cut with UTF-16 `.slice`"
  - id: IN-04
    severity: info
    disposition: open
    title: "The paste-code route counts non-code 401s as rejected codes"
  - id: IN-05
    severity: info
    disposition: open
    title: "`useNowUntil` duplicates `useSecondsUntil`"
open: 5
total: 11
recorded: 2026-10-21T19:44:13.935Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 03-REVIEW-FIX.md |
| WR-01 | warning | fixed | 03-REVIEW-FIX.md |
| WR-02 | warning | fixed | 03-REVIEW-FIX.md |
| WR-03 | warning | fixed | 03-REVIEW-FIX.md |
| WR-04 | warning | fixed | 03-REVIEW-FIX.md |
| WR-05 | warning | fixed | 03-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
