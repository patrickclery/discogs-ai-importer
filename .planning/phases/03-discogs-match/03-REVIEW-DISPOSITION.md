---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "A spine whose auto search ended `skipped` is never auto-searched again, while the UI says it is \"waiting its turn\""
  - id: WR-01
    severity: warning
    disposition: open
    title: "Three different \"baseline\" rules plus a permanent auto dedupe key cause stuck spines, a write lock on every lease tick, and stale candidates shown as current"
  - id: WR-02
    severity: warning
    disposition: open
    title: "A rate-limit pause can make a running search time out and spend an attempt (violates D-06)"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Saving a new consumer key while connected keeps the old token, but clearing the key disconnects"
  - id: WR-04
    severity: warning
    disposition: open
    title: "A successful Test connection clears \"Reconnect needed\" but leaves every `auth_failed` spine failed"
  - id: WR-05
    severity: warning
    disposition: open
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
open: 11
total: 11
updated: 2026-10-21T18:35:50.582Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
