# Phase 2: Shelf Scan - Discussion Log

> **Audit trail only.** Do not use this as input to planning, research or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-10-19
**Phase:** 02-shelf-scan
**Areas discussed:** iPhone HEIC photos, Dense shelves, Review & edit UX, Re-scan edit merge
**Mode:** advisor (research-backed comparison per area, calibration: standard)

---

## iPhone HEIC photos

| Option | Description | Selected |
|--------|-------------|----------|
| heic-decode → sharp | WASM decode inside the scan job, raw RGBA into sharp, a single lossy encode | ✓ |
| heic-convert → JPEG → sharp | Simpler API, but a double JPEG encode softens spine text | |
| Reject HEIC | The user shoots or exports JPEG | |

**User's choice:** heic-decode → sharp

## Dense shelves

| Option | Description | Selected |
|--------|-------------|----------|
| Spike first + soft warning | Verify the CLI pixel space and pick the model and thresholds on real photos, then show a warning badge | ✓ |
| Soft warning only, no spike | Guessed thresholds | |
| Warning + tiles in one call | Full photo plus tiles in a single CLI run | |

**User's choice:** Spike first + soft warning
**Notes:** The owner will put 3-5 photos in `fixtures/spike/`.

## Review & edit UX

| Option | Description | Selected |
|--------|-------------|----------|
| Cards grouped by photo, inline edit | Crop above the field grid, autosave, amber low-confidence flag, Edited and revert | ✓ |
| Compact list + side panel | Master-detail, scales to thousands of spines | |
| Table + edit dialog | Read-only rows with an edit modal | |

**User's choice:** Cards grouped by photo, inline edit

## Re-scan edit merge

| Option | Description | Selected |
|--------|-------------|----------|
| Geometry + text score, versioned runs | Box overlap first, text similarity as tiebreaker, stable spine IDs, orphan flagging | ✓ |
| Geometry only | Box overlap alone | |
| Replace, no merge | Fails success criterion 5 | |

**User's choice:** Geometry + text score, versioned runs

## Claude's Discretion

- Confidence threshold, crop padding, thumbnail sizes, upload limits, prompt wording and schema field names.

## Deferred Ideas

- Tiling in one call (pending the spike), a Phase 3 side panel for candidates, and a hard cap (rejected).
