---
phase: 02
review: 02-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "A save sent by the unmount flush fails silently, so the edit is lost"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The deferred commit has no flush on page hide or unload, so a blur-triggered save can be lost"
  - id: IN-01
    severity: info
    disposition: open
    title: "`isPending()` is exported API used only by tests"
  - id: IN-02
    severity: info
    disposition: open
    title: "The G-02-5 fix in SpineField is untested; only the pure controller is"
  - id: IN-03
    severity: info
    disposition: open
    title: "The polling recovery test does not match the production retry configuration"
  - id: IN-04
    severity: info
    disposition: open
    title: "The PhotoStatusList doc comment is stale"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Focusing and leaving a field silently records an owner edit when Claude's read has surrounding whitespace"
  - id: CR-02
    severity: critical
    disposition: fixed
    title: "The paid vision call is spawned without checking that the CLI is on the subscription"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "`encodeVision` can return a JPEG above `VISION_JPEG_MAX_BYTES`, silently"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Uploads are refused based on the browser-reported MIME type"
open: 6
total: 10
recorded: 2026-10-20T08:36:38.849Z
---

# Phase 02: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| CR-01 | critical | fixed | 02-REVIEW-FIX.md (not in the current review) |
| CR-02 | critical | fixed | 02-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 02-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 02-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
