---
phase: 07
review: 07-REVIEW.md
titles: json
findings:
  - id: IN-01
    severity: info
    disposition: open
    title: "`CornerNumeral` size `sm` is dead, and the parent contract is not enforced"
  - id: IN-02
    severity: info
    disposition: open
    title: "`##` heading markers on Settings card titles, which are not headings"
  - id: IN-03
    severity: info
    disposition: open
    title: "The scanline overlay is above dialogs but below toasts, and it ignores `prefers-contrast: more`"
  - id: IN-04
    severity: info
    disposition: open
    title: "`featured` is inferred from whether a footer slot was passed"
  - id: IN-05
    severity: info
    disposition: open
    title: "The WR-04 guard checks only the h1's own className, but `text-shadow` is inherited"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "The font fallbacks are proportional Arial, so `.ascii-art`'s `monospace` fallback never applies"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "asciiMono is preloaded on every route but used only on /upload at 640px and wider"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "The settings step numbers are split across shared components and page files"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "The \"gradient only on page h1s\" test does not guard the rule it names"
open: 5
total: 9
recorded: 2026-10-26T08:49:12.145Z
---

# Phase 07: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| WR-01 | warning | fixed | 07-REVIEW-FIX.md (not in the current review) |
| WR-02 | warning | fixed | 07-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 07-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 07-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
