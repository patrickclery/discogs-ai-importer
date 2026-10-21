---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-10-21T02:18:10.288Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | stub | src/components/discogs-matches.tsx |  | DiscogsMatches accepts pausedUntil but does not render the paused line yet (Plan 03-09) | open |  | 2026-10-21T02:18:10.184Z |  |
| 2 | 03 | stub | src/components/discogs-matches.tsx |  | DiscogsMatches header action group is empty (Plans 03-10 and 03-11 add Search again, Retry, Search Discogs…) | open |  | 2026-10-21T02:18:10.288Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "03",
    "file": "src/components/discogs-matches.tsx",
    "line": null,
    "description": "DiscogsMatches accepts pausedUntil but does not render the paused line yet (Plan 03-09)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-21T02:18:10.184Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "stub",
    "phase": "03",
    "file": "src/components/discogs-matches.tsx",
    "line": null,
    "description": "DiscogsMatches header action group is empty (Plans 03-10 and 03-11 add Search again, Retry, Search Discogs…)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-21T02:18:10.288Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
