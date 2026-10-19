# Phase 2: Shelf Scan - Context

**Gathered:** 2026-10-19
**Status:** Ready for planning

<domain>
## Phase Boundary

User drops shelf photos on the Upload page. Each photo is hashed (dedup), normalized locally, and analyzed with exactly ONE headless `claude -p` vision call that returns every CD spine as structured JSON. Each spine is cropped locally, rotated to horizontal, and shown on the Spines page next to its AI-extracted fields. The user can correct the fields, and edits persist alongside the original AI values. The user can explicitly re-scan a photo, and edits survive on spines that still match.

No Discogs calls happen in this phase (that is Phase 3). Non-CD spines are ignored.

Requirements: INGEST-01..05, VIS-01..04, REV-01, REV-02.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (Phase 1, not re-asked)
- Vision runs only through the Claude subscription via headless `claude -p --output-format json --json-schema <schema> --model <id>`, with the image passed by file path (Phase 1 D-18). There is no SDK and no API key. Spawn through the existing `src/server/claude/cli.ts` / `src/server/proc/run.ts` helpers (env scrub, tmpdir cwd, process-group kill).
- The model comes from the `vision_model` setting (Opus 5.5 by default, Sonnet 5.5 allowed).
- Scan jobs run in the `anthropic` lane with a `dedupe_key` so duplicate paid calls are impossible by construction.
- Files live under `DATA_DIR` (`photos/`, `vision/`, `crops/`, `thumbs/`), and the DB stores relative paths only (Phase 1 D-04/D-05).
- CDs only. Non-CD spines in a photo are ignored.

### Spike before planning the vision pipeline
- **D-01:** The first task of this phase is a spike on 3-5 real shelf photos. The owner puts them in `fixtures/spike/`, which must be gitignored. Aim for one sparse shelf, one with about 40 spines and one with about 60, ideally iPhone HEIC originals. The spike must:
  1. Confirm the real pixel space Claude sees through the CLI Read tool. Send a known-size normalized image and check that the returned boxes line up. There are unconfirmed reports of a ~2000 px cap and of downscaling based on file size. Treat the 2576 px / 1:1 coordinate assumption in STACK.md as unverified for the CLI path until this check passes.
  2. Compare Opus 5.5 and Sonnet 5.5 (and effort, if the CLI exposes it) on misread and truncation rates at each density.
  3. Set the density-warning thresholds (D-03) and decide whether tiling (deferred) is needed.
  The spike's findings set the normalization long-edge size and the schema before the schema is frozen. — **Reversibility:** one-way — the vision schema must be frozen after the spike (roadmap note), because changing it later means paid re-runs.
- **D-02:** The spike photos are kept as Vitest fixtures for the crop and box math. Recorded CLI responses are also kept as fixtures. Tests never call the live CLI.

### Dense shelves
- **D-03:** Add a soft density warning computed after parsing. It fires when the spine count is above N, the median spine width is under about W px, or boxes overlap or are out of order. The photo shows a "retake closer" badge, and the Upload page gives a short tip to photograph shelves in narrower sections. N and W come from the spike and are stored as settings. There is no hard cap, so every returned spine is kept.
- **D-04:** A truncated, refused or schema-invalid CLI result marks the photo `error` with a reason. The raw output is persisted first (VIS-03). Nothing is silently dropped.

### HEIC input
- **D-05:** HEIC/HEIF uploads are decoded server-side with `heic-decode` (libheif-js WASM). The raw RGBA goes into sharp (`sharp(data, { raw: { width, height, channels: 4 } })`), followed by the normal `.rotate().resize(...).jpeg(q≈90)` pipeline. There is no heic-convert and no double JPEG encode. Decoding happens inside the scan job, not the upload route, because it is synchronous CPU work. If decoding fails, the photo errors with a clear message suggesting JPEG ("Most Compatible"). Hash the original upload bytes before decoding. The spike must check orientation (`irot`/`imir`) on a real iPhone HEIC.
- **D-06:** Accepted inputs are JPEG, PNG, WebP and HEIC/HEIF, detected by magic bytes as well as MIME type.

### Review & edit UX
- **D-07:** `/spines` is a list of cards grouped under sticky photo section headers. Each header has a thumbnail, filename, status, spine count and the density badge. A `?photo=` filter (nuqs) lists one photo, and a "needs review" filter lists spines with low-confidence fields.
- **D-08:** Each card shows the full-width horizontal crop on top and a field grid below: artist, title, format, label, catalog number and raw text. Fields are edited inline and autosave on blur (optimistic, debounced). Polling must not clobber a field being edited.
- **D-09:** A field below the confidence threshold gets the reserved `--warning` amber border plus a tooltip with its score (01-UI-SPEC.md Warning token). Each card shows a row-level "worst field" indicator.
- **D-10:** Each field stores `{ ai_value, value, confidence }`. "Edited" means `value !== ai_value` and is shown as an "Edited" badge with a per-field revert. The original AI value is never overwritten by an edit. — **Reversibility:** costly — Phase 3 search and Phase 4 import read these fields, and re-scan merge depends on them.
- **D-11:** Each card has a right-aligned status-badge slot and a collapsible footer region, which Phase 3 fills with Discogs candidates without a layout rework.
- **D-12:** The Upload page uses react-dropzone with a multi-file drop and per-photo status (queued / analyzing / done / error), polled with TanStack Query. An identical re-upload links to the existing photo and spines, with zero calls.

### Re-scan merge
- **D-13:** Vision runs are versioned. A `vision_runs` table (photo, run_no, model, raw output, usage, status) holds one row per run, and each run's per-spine detections (bbox, AI fields, confidence, orientation) point to a stable `spines` row. Earlier runs are never overwritten. — **Reversibility:** one-way — spine identity is what Phase 3 matches and Phase 4 imports attach to, so changing it later needs a data migration.
- **D-14:** Re-scan matching uses a combined score, with horizontal box overlap or normalized center distance as the main signal and raw-text similarity (normalized Levenshtein, no dependency) as the tiebreaker. Pairing is greedy one-to-one by descending score above a cutoff. Ordinal position may only be used as a minor tiebreaker. Weights and the cutoff are tuned against the spike fixtures.
- **D-15:** A matched spine keeps its ID and the user's edits. Only its current detection and crop move to the new run. If the new AI read of an edited field differs from the stored original, keep the user's value and show the new AI read beside it.
- **D-16:** If an old spine is unmatched and has no edits, it is soft-retired (`superseded`). If it has edits (and later a Discogs match or import), it is never dropped. It is marked `orphaned` and flagged for review, keeping its old crop, with "re-attach to a new spine" or "dismiss" actions.
- **D-17:** Re-scan is only ever an explicit user action (a button on the photo header, with a confirm because it spends subscription quota). It is the only path that sends a photo to Claude again.

### Claude's Discretion
- The exact confidence threshold value (start around 0.6 and tune from the spike).
- The crop padding amount, and the rotation direction per `text_orientation`.
- Thumbnail sizes, card spacing, and virtualization (only if the list goes past ~500 rows).
- The upload route's streaming and size limits (a route handler, not a Server Action).
- The prompt wording and the exact schema field names, within VIS-02.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope
- `.planning/PROJECT.md`: constraints (one call per photo, subscription billing, CDs only, portability)
- `.planning/REQUIREMENTS.md`: definitions of INGEST-01..05, VIS-01..04 and REV-01..02
- `.planning/ROADMAP.md` §Phase 2: goal and the 5 success criteria

### Prior phase
- `.planning/phases/01-foundation/01-CONTEXT.md`: D-04/D-05 storage layout, D-12..D-14 jobs, D-18 the Claude CLI subscription path
- `.planning/phases/01-foundation/01-UI-SPEC.md`: design tokens, including the `--warning` token reserved for low-confidence fields
- `.planning/phases/01-foundation/01-VERIFICATION.md`: what Phase 1 actually shipped

### Research
- `.planning/research/STACK.md`: sharp pipeline, versions, react-dropzone, TanStack Query, nuqs. Its API-specific notes (SDK, `output_config`) do not apply, because vision goes through the CLI
- `.planning/research/PITFALLS.md`: coordinate and orientation pitfalls, dense-shelf hallucination and truncation
- `.planning/research/ARCHITECTURE.md`: data model and job flow
- `.planning/research/SUMMARY.md`: Phase 2 research flags (the spike, the hash-target decision: hash the raw bytes)

### External
- https://code.claude.com/docs/en/headless.md: headless `claude -p` flags and JSON output

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/claude/cli.ts`: CLI detection and readiness, plus the headless spawn pattern for the vision call
- `src/server/proc/run.ts`: child process runner with a process-group kill and timeouts
- `src/server/jobs/{queue,worker,lease}.ts` and `handlers/index.ts`: register the `scan_photo` handler here, using attempt guards and dedupe keys
- `src/server/storage/paths.ts`: the only authority for absolute paths under `DATA_DIR`
- `src/server/settings.ts`: `vision_model`. Add the density, threshold and confidence settings here
- `src/components/ui/*`: shadcn badge, card, empty, field, input, tooltip, skeleton, sonner and spinner already exist
- `src/app/upload/page.tsx` and `src/app/spines/page.tsx`: placeholders to replace

### Established Patterns
- Server-only modules (`import 'server-only'`), ULID IDs, epoch-ms timestamps, migrations at boot
- `/api/status` polling for the shell status indicator
- The proxy rejects foreign Origins on mutations, so the new upload and PATCH routes inherit this

### Integration Points
- `src/server/db/schema.ts` currently holds only `jobs`, `settings` and `worker_lease`. Phase 2 adds `photos`, `vision_runs`, `spine_detections` and `spines` (names at the planner's discretion)
- A file-serving route handler streams crops and thumbs from `DATA_DIR` (not `public/`)

</code_context>

<specifics>
## Specific Ideas

- Core value: the spine crop must always be visible next to what the AI read. Every layout choice serves that.
- The owner shoots with an iPhone, so HEIC drag-and-drop should just work.
- Subscription quota is the cost to protect, so there are no automatic re-sends of any kind.

</specifics>

<deferred>
## Deferred Ideas

- Sending the full photo plus overlapping tiles in one CLI run, for better readability on dense shelves. Add only if the spike shows a misread rate above ~10-15% on 30-50 spine photos.
- A master-detail side panel (Sheet) for Discogs candidate review is a possible Phase 3 addition on top of the card layout.
- A hard spine cap was rejected in favour of a warning level.

</deferred>

---

*Phase: 02-shelf-scan*
*Context gathered: 2026-10-19*
