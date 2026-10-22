# Phase 4: Import & Review Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 04-import-review-queue
**Areas discussed:** Confirm flow, Collection folder, Duplicate warnings, Exactly-once import, Status model and filter, Retry and Not on Discogs
**Mode:** --auto (recommended option picked for every question, no prompts)

---

[auto] Confirm flow — Q: "How does the owner confirm?" → Selected: "Add to collection button per candidate row, enqueues one job" (recommended). Alternatives: select-then-confirm-bar; confirm dialog per spine.
[auto] Confirm flow — Q: "Can the match change after import?" → Selected: "Locked; undo deferred" (recommended).
[auto] Collection folder — Q: "Where is the folder chosen?" → Selected: "Global setting on Settings, default Uncategorized" (recommended). Alternatives: per-spine select; per-photo select.
[auto] Duplicate warnings — Q: "When is the remote already-in-collection check made?" → Selected: "Inside the import job, before POST, with Link existing / Add another copy choice" (recommended). Alternatives: check on candidate display (extra read per candidate); rely on search-result collection flags (unverified).
[auto] Duplicate warnings — Q: "Local cross-photo duplicate?" → Selected: "Instant AlertDialog before enqueue" (recommended).
[auto] Exactly-once import — Q: "Idempotency mechanism?" → Selected: "Intent row before POST, reconcile via collection/releases/{id} before any retry POST" (recommended, PITFALLS 6). Alternative: blind retry with dedupe key only.
[auto] Status model — Q: "Filter UI?" → Selected: "Status ToggleGroup with counts in ?status=, Needs review kept separate" (recommended). Alternative: tabs per status; dropdown.
[auto] Retry — Q: "Retry scope?" → Selected: "Per-item Retry plus Retry all failed" (recommended).
[auto] Not on Discogs — Q: "Reversible?" → Selected: "Yes, Unmark; blocked on imported spines" (recommended).

## Claude's Discretion

Table names, clock-skew margin, folder-list caching, narrow-screen filter layout, bulk retry route shape.

## Deferred Ideas

Undo import, bulk accept / keyboard review, per-spine folder, instance notes / shelf location, unverified-version flag, smarter ranking.
