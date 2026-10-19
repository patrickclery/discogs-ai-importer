# Phase 2: Shelf Scan - Research

**Researched:** 2026-10-19
**Domain:** Image ingest (HEIC/JPEG, sharp), a headless Claude CLI vision call with structured output, local crop geometry, SQLite data model for versioned AI reads and user edits, and a Next 16 review UI
**Confidence:** MEDIUM-HIGH. The code seams, CLI flags, API image-sizing rules and package versions were verified this session. Two items are still unverified until the D-01 spike runs: the CLI's real pixel space, and accuracy at each density.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried forward (Phase 1, not re-asked)
- Vision runs only through the Claude subscription via headless `claude -p --output-format json --json-schema <schema> --model <id>`, with the image passed by file path (Phase 1 D-18). There is no SDK and no API key. Spawn through the existing `src/server/claude/cli.ts` / `src/server/proc/run.ts` helpers (env scrub, tmpdir cwd, process-group kill).
- The model comes from the `vision_model` setting (Opus 5.5 by default, Sonnet 5.5 allowed).
- Scan jobs run in the `anthropic` lane with a `dedupe_key` so duplicate paid calls are impossible by construction.
- Files live under `DATA_DIR` (`photos/`, `vision/`, `crops/`, `thumbs/`), and the DB stores relative paths only (Phase 1 D-04/D-05).
- CDs only. Non-CD spines in a photo are ignored.

#### Spike before planning the vision pipeline
- **D-01:** The first task of this phase is a spike on 3-5 real shelf photos. The owner puts them in `fixtures/spike/`, which must be gitignored. Aim for one sparse shelf, one with about 40 spines and one with about 60, ideally iPhone HEIC originals. The spike must:
  1. Confirm the real pixel space Claude sees through the CLI Read tool. Send a known-size normalized image and check that the returned boxes line up. There are unconfirmed reports of a ~2000 px cap and of downscaling based on file size. Treat the 2576 px / 1:1 coordinate assumption in STACK.md as unverified for the CLI path until this check passes.
  2. Compare Opus 5.5 and Sonnet 5.5 (and effort, if the CLI exposes it) on misread and truncation rates at each density.
  3. Set the density-warning thresholds (D-03) and decide whether tiling (deferred) is needed.
  The spike's findings set the normalization long-edge size and the schema before the schema is frozen. — **Reversibility:** one-way — the vision schema must be frozen after the spike (roadmap note), because changing it later means paid re-runs.
- **D-02:** The spike photos are kept as Vitest fixtures for the crop and box math. Recorded CLI responses are also kept as fixtures. Tests never call the live CLI.

#### Dense shelves
- **D-03:** Add a soft density warning computed after parsing. It fires when the spine count is above N, the median spine width is under about W px, or boxes overlap or are out of order. The photo shows a "retake closer" badge, and the Upload page gives a short tip to photograph shelves in narrower sections. N and W come from the spike and are stored as settings. There is no hard cap, so every returned spine is kept.
- **D-04:** A truncated, refused or schema-invalid CLI result marks the photo `error` with a reason. The raw output is persisted first (VIS-03). Nothing is silently dropped.

#### HEIC input
- **D-05:** HEIC/HEIF uploads are decoded server-side with `heic-decode` (libheif-js WASM). The raw RGBA goes into sharp (`sharp(data, { raw: { width, height, channels: 4 } })`), followed by the normal `.rotate().resize(...).jpeg(q≈90)` pipeline. There is no heic-convert and no double JPEG encode. Decoding happens inside the scan job, not the upload route, because it is synchronous CPU work. If decoding fails, the photo errors with a clear message suggesting JPEG ("Most Compatible"). Hash the original upload bytes before decoding. The spike must check orientation (`irot`/`imir`) on a real iPhone HEIC.
- **D-06:** Accepted inputs are JPEG, PNG, WebP and HEIC/HEIF, detected by magic bytes as well as MIME type.

#### Review & edit UX
- **D-07:** `/spines` is a list of cards grouped under sticky photo section headers. Each header has a thumbnail, filename, status, spine count and the density badge. A `?photo=` filter (nuqs) lists one photo, and a "needs review" filter lists spines with low-confidence fields.
- **D-08:** Each card shows the full-width horizontal crop on top and a field grid below: artist, title, format, label, catalog number and raw text. Fields are edited inline and autosave on blur (optimistic, debounced). Polling must not clobber a field being edited.
- **D-09:** A field below the confidence threshold gets the reserved `--warning` amber border plus a tooltip with its score (01-UI-SPEC.md Warning token). Each card shows a row-level "worst field" indicator.
- **D-10:** Each field stores `{ ai_value, value, confidence }`. "Edited" means `value !== ai_value` and is shown as an "Edited" badge with a per-field revert. The original AI value is never overwritten by an edit. — **Reversibility:** costly — Phase 3 search and Phase 4 import read these fields, and re-scan merge depends on them.
- **D-11:** Each card has a right-aligned status-badge slot and a collapsible footer region, which Phase 3 fills with Discogs candidates without a layout rework.
- **D-12:** The Upload page uses react-dropzone with a multi-file drop and per-photo status (queued / analyzing / done / error), polled with TanStack Query. An identical re-upload links to the existing photo and spines, with zero calls.

#### Re-scan merge
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

### Deferred Ideas (OUT OF SCOPE)
- Sending the full photo plus overlapping tiles in one CLI run, for better readability on dense shelves. Add only if the spike shows a misread rate above ~10-15% on 30-50 spine photos.
- A master-detail side panel (Sheet) for Discogs candidate review is a possible Phase 3 addition on top of the card layout.
- A hard spine cap was rejected in favour of a warning level.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INGEST-01 | Drag and drop one or more photos into the upload page | react-dropzone 20.1.x with one `POST` per file (Pattern 1). Raise `proxyClientMaxBodySize`, or bodies over 10 MB get **silently truncated** (Pitfall 1) |
| INGEST-02 | Per-photo status (queued / analyzing / done / error) | Derive photo status from `vision_runs.status`, and poll with TanStack Query `refetchInterval` as a function (Pattern 7) |
| INGEST-03 | Identical re-upload (same SHA-256) makes zero Claude calls | Hash the raw bytes in the route, insert with `photos.sha256 UNIQUE ... ON CONFLICT DO NOTHING`, and enqueue only when a new photo row is created (Pattern 2) |
| INGEST-04 | Explicit re-scan only; edits survive on spines that still match | `vision_runs` versioning, a `spine_fields` merge rule, and greedy 2-D matching (Pattern 6). Scan jobs get `max_attempts = 1` (Pitfall 3) |
| INGEST-05 | EXIF-rotate and resize locally; the image sent equals the image crops come from | `autoOrient()`, then the official `resizedSize()` (tier 2576 px / 4784 tokens), then JPEG q90 kept under 500 KB (Pattern 3, Pitfalls 4-5) |
| VIS-01 | Exactly ONE Claude call per photo returning every spine as structured JSON | One `claude -p --json-schema` spawn per `vision_runs` row, with a ledger row written before the spawn (Pattern 4) |
| VIS-02 | Artist, title, format, label, catno, raw text, bbox, per-field confidence, text orientation | Schema sketch in Code Examples. The orientation enum needs 4 values because the owner's real photo has upside-down spines (Pitfall 7) |
| VIS-03 | Persist raw response before parsing; surface truncation and refusal | Write stdout to `vision/<photoId>/run-<n>.json` before Zod. The success test is `subtype==='success' && structured_output` plus a Zod parse plus a count cross-check (Pattern 4) |
| VIS-04 | Crop locally with padding and rotate to horizontal | sharp `extract()` then `rotate(0/90/180/270)` per orientation (Pattern 5) |
| REV-01 | Spine list with crop next to fields on every row | `/spines` cards grouped by photo, crops served by a `DATA_DIR` file route (Pattern 8) |
| REV-02 | Edit any field, stored separately from AI output | A `spine_fields(ai_value, value, confidence)` row per field, PATCH on blur, plus a dirty/focus guard against polling (Pattern 7) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Next.js App Router plus TypeScript (`typescript` pinned at 6.0.3). Uploads go through a **Route Handler, never a Server Action**, because Server Actions have a 1 MB body limit.
- SQLite via better-sqlite3 13 and Drizzle 0.45. Do **not** adopt Drizzle 1.0 rc.
- **Exactly one Claude vision call per uploaded photo.** No per-spine AI calls. Cache by image hash.
- Portability: all state lives in `DATA_DIR`, and the DB stores relative paths only.
- Secrets are never committed. (Phase 2 adds no secrets.)
- Uploaded images are never put in `public/`. They are served by a route handler from `data/`.
- Do not send raw phone photos to Claude. Normalize first (rotate and resize) and persist that buffer.
- Do not ask for normalized 0-1 or 0-1000 coordinates. Use integer pixels.
- Biome for lint and format. Vitest for tests, using recorded fixtures and never the live CLI or APIs.
- Work goes through GSD commands (planning artifacts stay in sync).
- STACK.md's SDK-specific notes (`messages.parse`, `output_config`, `@anthropic-ai/sdk`) **do not apply**. Vision goes through the CLI (D-18).

## Summary

Most of the phase sits on seams Phase 1 already built. `buildClaudeArgs()` already supports a Read-only tool scope through `readDirs`/`--add-dir`. `runProcess()` already does group kill, timeout and abort. The job queue already has `dedupe_key` uniqueness and the WR-04 `isCurrent()` fence for paid side effects. The new work is in four places. The first is a deterministic image pipeline: HEIC decode, auto-orient, an exact model-tier resize, and a size-capped JPEG. The second is a vision call that writes a ledger row **before** the spawn and the raw output **before** parsing. The third is a data model that separates immutable per-run detections from stable spine identity and per-field user values. The fourth is a polling review UI that never overwrites a field being edited.

Two findings from this session change the plan. **(1)** The owner's spike photo (`fixtures/spike/cd-spines.heic`) is a 4536x8064 portrait HEIC, shot from above, of CDs **stacked flat in two columns of about 35**. The spines are horizontal and several are **upside-down**. So "rotate vertical text" is not the main case. The orientation enum, density checks and re-scan matching must be 2-D and layout-agnostic. At the model-tier size (1449x2576) each spine is only about 35 px tall. **(2)** Next 16's `proxy.ts` (present in this repo, matching every route) buffers request bodies up to **10 MB and silently truncates** anything larger. The route still runs, with a partial body. Raw iPhone HEIC files are 3-8 MB (this one is 7.1 MB), and 48 MP JPEG or ProRAW-derived files exceed 10 MB, so `experimental.proxyClientMaxBodySize` must be raised and the received length checked.

The CLI path is confirmed to support `--json-schema` (result in `structured_output`), `--effort low|medium|high|xhigh|max`, and `--max-turns`. Claude Code's Read tool "resizes and recompresses large images to fit the model's image size limits", and re-encodes anything still over 500 KB as a lower-quality JPEG "with its pixel dimensions unchanged". So the pipeline must pre-size to the official `resizedSize(w, h, 2576, 4784)` and keep the JPEG at or under 500 KB. Measured on the real photo, q90 mozjpeg at 1449x2576 comes to 388 KB. The spike must still prove that boxes come back in that pixel space through the CLI.

**Primary recommendation:** Build the phase as follows: Wave 0 calibration spike, then the image pipeline plus schema (freeze), then a scan job with a pre-spawn ledger and `max_attempts=1`, then crops, then review UI plus re-scan merge. Never let a job retry after the CLI was spawned.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File drop, per-file upload, status display | Browser / Client | — | react-dropzone and TanStack Query polling are client components |
| Upload receive, magic-byte check, SHA-256, dedup, original write, enqueue | API / Backend (Route Handler) | Database | Must be fast and must not decode HEIC (D-05) |
| HEIC decode, auto-orient, resize, vision JPEG, thumbnail | API / Backend (worker job `scan_photo`) | Storage (`DATA_DIR`) | CPU work belongs in the job, off the request path |
| Claude vision call | API / Backend (worker, `anthropic` lane) | External: Claude CLI subprocess | Single spawn, ledgered, fenced by `isCurrent()` |
| Parse, validate, density flags, crop | API / Backend (same job, after the raw output is persisted) | Storage | Pure functions plus sharp, re-runnable from the stored raw output |
| Re-scan merge (match old spines to new detections) | API / Backend (same job, one SQLite transaction) | Database | Spine identity is one-way (D-13) |
| Field edits and revert | API / Backend (PATCH route) | Browser (optimistic state) | Validate with Zod server-side; the client only keeps drafts |
| Crop, thumbnail and photo serving | API / Backend (GET file route) | Browser cache | `public/` is not served for runtime files |
| URL filters (`?photo=`, needs-review) | Browser (nuqs) | Frontend Server (RSC reads `searchParams`) | Keeps filters across reloads |

## Standard Stack

### Core (new in Phase 2)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sharp | 0.35.5 (already in the lockfile as a Next transitive dependency; add as a **direct** dependency at the same version) | autoOrient, resize, JPEG encode, extract and rotate crops, thumbnails | The de-facto Node image library. Auto-externalized by Next 16. Prebuilt `@img/sharp-linux-x64@0.35.5` is already installed [VERIFIED: npm registry + node_modules/.pnpm] |
| heic-decode | 2.1.0 | HEIC/HEIF to RGBA (libheif-js WASM) | Locked by D-05. **Probed this session** on the owner's real 7.1 MB iPhone HEIC: decoded 4536x8064 `Uint8ClampedArray` (146,313,216 bytes) in 1,946 ms, process RSS 461 MB [VERIFIED: local probe] |
| react-dropzone | 20.1.x (pin `20.1.3`, see audit) | Multi-file drag and drop with MIME filtering | Standard. Requires Node >= 22 (`engines`), which this repo meets [VERIFIED: npm registry] |
| @tanstack/react-query | 5.104.x (pin `5.104.2`, see audit) | Polling photo and spine status, optimistic PATCH mutations | Standard client cache with `refetchInterval` [VERIFIED: npm registry] |
| nuqs | 2.10.x (pin `2.10.1`, see audit) | `?photo=` and `?review=` URL state | Exports `./adapters/next/app` [VERIFIED: npm view exports] |

### Already present (reuse, do not re-add)
zod 4.6.7 (schema plus `z.toJSONSchema(..., { target: 'draft-07' })`, verified locally to emit `"$schema":"http://json-schema.org/draft-07/schema#"`), ulid 3.0.2 (`newId()`), drizzle-orm 0.45.4, drizzle-kit 0.31.11, the shadcn components in `src/components/ui/*`, sonner, and lucide-react.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| heic-decode to raw to sharp | `magick`/`heif-convert` CLI (present on this machine: `/usr/bin/magick`, `/usr/bin/heif-info`) | Not portable, because it is not in node_modules. Rejected (D-05) |
| Read tool by file path | `--input-format stream-json` with a base64 image block on stdin | Avoids the Read tool's resize and recompress path. But the installed CLI rejects it unless `--output-format stream-json` is also set (verified: `Error: --input-format=stream-json requires output-format=stream-json.`), and `runProcess` uses `stdio: ['ignore', ...]`. Keep as the **spike fallback only** if the Read path fails calibration |
| Per-file raw `POST` | Multipart `formData()` with all files | Multipart batches multiply proxy buffering and give no per-file status. Use one request per file |
| `spine_fields` row table | 18 columns on `spines` (`artist_ai`, `artist`, `artist_conf`, ...) | Columns are slightly easier for Phase 3 SQL. Rows make per-field PATCH, revert and merge uniform. Either honours D-10. Recommend rows |

**Installation:**
```bash
pnpm add sharp@0.35.5 heic-decode@2.1.0 react-dropzone@20.1.3 @tanstack/react-query@5.104.2 nuqs@2.10.1
```
`pnpm-workspace.yaml` has `allowBuilds: sharp: false` [VERIFIED: pnpm-workspace.yaml]. That is fine, because sharp 0.35 uses prebuilt `@img/*` optional dependencies and needs no install script (`npm view sharp scripts.install` is empty).

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| sharp | npm | 0.35.5 on 2026-09-27 (project ~10 yrs) | 70.5M | github.com/lovell/sharp | SUS (`too-new`) | Approved. Already resolved in `pnpm-lock.yaml` (line 3395) and installed, so the "too-new" flag is about the latest version, not the package. No postinstall |
| heic-decode | npm | 2.1.0 on 2025-07-04 | 1.36M | github.com/catdad-experiments/heic-decode | OK | Approved |
| react-dropzone | npm | 20.1.4 on 2026-10-17 (2 days old) | 7.9M | github.com/react-dropzone/react-dropzone | SUS (`too-new`) | Flagged. Pin **20.1.3** (2026-10-10). The planner adds a `checkpoint:human-verify` before install |
| @tanstack/react-query | npm | 5.104.4 on 2026-10-17 | 40.6M | github.com/TanStack/query | SUS (`too-new`) | Flagged. Pin **5.104.2** (2026-10-11), with a checkpoint |
| nuqs | npm | 2.10.2 on 2026-10-08 | 3.4M | github.com/47ng/nuqs | SUS (`too-new`) | Flagged. Pin **2.10.1** (2026-08-25), with a checkpoint |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** react-dropzone, @tanstack/react-query, nuqs (all mature, multi-million weekly downloads; only the newest patch is recent). Pin the older patch versions above and gate the install behind one `checkpoint:human-verify`. None has a `postinstall` script (all `npm view ... scripts.postinstall` returned empty). Package names come from the project's own STACK.md research and CONTEXT.md D-05/D-12. libheif-js (the transitive dependency of heic-decode, 1.23.5) is pulled in automatically.

## Architecture Patterns

### System Architecture Diagram

```
 Browser /upload                        Route Handlers (Node)                     Worker (anthropic lane, concurrency 1)
 ───────────────                        ─────────────────────                     ──────────────────────────────────────
 drop N files ──(1 POST per file,──►  POST /api/photos
   react-dropzone   raw body)           ├─ check Content-Length vs bytes read (proxy truncation guard)
                                        ├─ magic bytes ∈ {jpeg,png,webp,heic} ── no ─► 415 {reason}
                                        ├─ sha256(raw bytes)
                                        ├─ INSERT photos ON CONFLICT(sha256) DO NOTHING
                                        │     existing? ── yes ─► 200 {photoId, duplicate:true}  (0 calls)
                                        ├─ write photos/<sh>/<sha>.<ext> (tmp+rename)
                                        └─ tx: INSERT vision_runs(run_no=1,'queued') + enqueue scan_photo
                                              (dedupe 'scan:<photoId>:1', max_attempts=1) ─► 201
                                                                                   claim scan_photo
 poll GET /api/photos (1.5 s while  ◄── status from vision_runs ──────────────────  ├─ run.status='preparing'
   any queued/analyzing)                                                          ├─ decode (HEIC→RGBA | sharp) → autoOrient
                                                                                  ├─ resizedSize(w,h,2576,4784) → vision.jpg ≤500 KB
                                                                                  │    + master.jpg (full-res upright) + thumb
                                                                                  ├─ isCurrent()? no ─► stop (no spawn)
                                                                                  ├─ run.status='calling', spawned_at=now  ◄─ LEDGER
                                                                                  ├─ claude -p … --json-schema … --add-dir vision/<id>/
                                                                                  ├─ write vision/<id>/run-<n>.json (raw stdout) ◄─ VIS-03
                                                                                  ├─ classify: spawn/timeout/is_error/subtype/
                                                                                  │    missing structured_output/Zod fail ─► run 'error'+reason
                                                                                  ├─ clamp boxes, filter media_kind, density flags
                                                                                  ├─ crops: extract(box+pad) → rotate(orientation) → crops/<id>/<detId>.webp
                                                                                  └─ tx: INSERT detections; run_no=1 → create spines+fields
                                                                                         run_no>1 → match/merge (D-14..D-16); run 'done'
 /spines (RSC + client cards) ◄── GET /api/spines?photo=&review= ── spines ⋈ spine_fields ⋈ current detection
   edit field, blur ──PATCH /api/spines/:id/fields──► UPDATE spine_fields SET value=? (ai_value untouched)
   crop <img> ──────── GET /api/files/crops/<id>/<detId>.webp ──► resolveData() → stream
 Re-scan button (confirm) ──POST /api/photos/:id/rescan──► tx: no active run? INSERT vision_runs(run_no+1) + enqueue
```

### Recommended Project Structure
```
src/
├── app/
│   ├── api/photos/route.ts                 # POST upload (one file), GET list+status
│   ├── api/photos/[id]/rescan/route.ts     # POST explicit re-scan (D-17)
│   ├── api/spines/route.ts                 # GET list (photo/review filters)
│   ├── api/spines/[id]/fields/route.ts     # PATCH {field, value} | {field, revert:true}
│   ├── api/files/[...path]/route.ts        # GET crops/, thumbs/ (and the vision image for debug)
│   ├── upload/page.tsx  spines/page.tsx    # replace placeholders
│   └── providers.tsx                       # 'use client' QueryClientProvider + NuqsAdapter
├── server/
│   ├── images/{detect,normalize,resize,crop}.ts   # pure + sharp; resize.ts = official resizedSize
│   ├── vision/{schema,prompt,run,parse,density}.ts
│   ├── scan/{ingest,merge,match,levenshtein}.ts
│   ├── jobs/handlers/scan-photo.ts         # register in handlers/index.ts
│   └── db/schema.ts                        # + photos, vision_runs, spine_detections, spines, spine_fields
└── components/{dropzone,photo-status-list,spine-card,spine-field}.tsx
scripts/spike-vision.ts                     # D-01 calibration + model comparison (owner-run)
src/**/*.test.ts                            # vitest include is 'src/**/*.test.ts' [VERIFIED: vitest.config.ts:18]
```

### Pattern 1: One upload request per file, through the proxy
**What:** The client loops over accepted files and sends `fetch('/api/photos', { method: 'POST', body: file, headers: { 'x-filename': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream' } })` with concurrency 2. The route reads `await request.arrayBuffer()`, rejects the request when `byteLength !== Number(request.headers.get('content-length'))` (proxy truncation), and caps the size at 64 MB.
**Why:** The proxy clones and buffers every body, with a 10 MB default (Pitfall 1). Per-file requests also give per-file status rows immediately.
**Config:** `next.config.ts` gets `experimental: { proxyClientMaxBodySize: '64mb' }` [CITED: node_modules/next/dist/docs/.../proxyClientMaxBodySize.md]. The upload POST and the PATCH routes inherit the existing Origin and `sec-fetch-site` guard in `src/proxy.ts` (matcher `'/((?!_next/static|_next/image|favicon.ico).*)'` [VERIFIED: src/proxy.ts:55]). Browser `fetch` from the same origin sends `sec-fetch-site: same-origin`, which is allowed (`new Set(['same-origin', 'none'])` [VERIFIED: src/proxy.ts:33]).

### Pattern 2: Dedup by raw-byte hash, enqueue only on creation
`sha256` over the **original upload bytes** (SUMMARY recommendation and D-05). In one `db.transaction(...).immediate()`: `INSERT INTO photos (...) VALUES (...) ON CONFLICT(sha256) DO NOTHING`. If `changes === 0`, return the existing photo (`duplicate: true`) and enqueue **nothing**. Otherwise insert `vision_runs(run_no=1, status='queued')` and enqueue `scan_photo` with `dedupeKey: \`scan:${photoId}:1\``. `enqueue()` already does `ON CONFLICT(dedupe_key) DO NOTHING` [VERIFIED: src/server/jobs/queue.ts:50-81, signature `enqueue(input: { lane: Lane; type: string; payload?: unknown; dedupeKey?: string; runAfter?: number; })`]. Write the original file before the transaction commits (content-addressed name, `tmp` then `rename`), so a crash never leaves a row without its file.

### Pattern 3: Deterministic normalization (the pixel-space contract)
```
input ──► (heic? heic-decode → sharp(raw RGBA)) : sharp(buffer, { failOn: 'error' })
      ──► .autoOrient()  (EXIF Orientation applied + tag removed; a no-op for raw input)
      ──► master.jpg  (full-res upright, q90)  ── store master_w/h
      ──► [w,h] = resizedSize(master_w, master_h, MAX_EDGE, MAX_TOKENS)   // official algorithm
      ──► .resize(w, h, { fit: 'fill' }) ──► vision.jpg q90 mozjpeg; while bytes > 500_000 step q −5 (floor 70)
      ──► re-read metadata(vision.jpg) and assert width===w && height===h; store vision_w/h, max_edge, max_tokens
```
- Use the **official `resizedSize`** (Code Examples), not "long edge 2576". For the owner's 4536x8064 photo it returns **1449x2576** (52 x 92 = 4784 tokens, exactly the budget). For a 4:3 4032x3024 photo it returns about 2212x1659, not 2576x1932 (the token limit binds) [CITED: platform.claude.com/docs/en/build-with-claude/vision-coordinates].
- Tier constants: `MAX_EDGE=2576, MAX_TOKENS=4784` for "Claude 4.7 and later models" [CITED: platform.claude.com vision docs, table "High-resolution | Claude 4.7 and later models | 2576 px | 4784"]. Both allowed models (`'claude-opus-5-5'`, `'claude-sonnet-5-5'` [VERIFIED: src/server/settings.ts:11-14]) are in this tier. Store the constants per run, so a spike-driven change (for example to a lower CLI cap) never invalidates old boxes.
- The vision image is a pure resize of the master: same frame, no crop, no padding. Box `b` in vision space maps to master space by `sx = master_w / vision_w`, `sy = master_h / vision_h`.

### Pattern 4: The ledgered single call (VIS-01, VIS-03, D-04)
1. Handler re-reads `vision_runs`. If `status` is already `calling` or beyond, it **must not spawn** (an interrupted earlier attempt). It marks the run `error: 'interrupted during analysis — re-scan to retry'`, unless a raw file exists, in which case it re-parses from disk (zero calls).
2. `if (!ctx.isCurrent()) return;`. The contract in `JobContext` says handlers MUST check it "right before any paid or external side effect" [VERIFIED: src/server/jobs/types.ts].
3. `UPDATE vision_runs SET status='calling', spawned_at=? WHERE id=? AND status='preparing'` (compare-and-set). This row **is** the "recorded Claude call".
4. Spawn (argv below) with `signal: ctx.signal` and `maxBuffer: 8_000_000`.
5. Write `stdout` (even empty) plus `stderr`, `exitCode` and `timedOut` to `vision/<photoId>/run-<n>.json` **before** any parsing. Store the relative path on the run.
6. Classify (first match wins) into `error` with a reason: `spawnError`, `timedOut`, `aborted`, `stdout.length >= maxBuffer` ("output truncated"), unparseable JSON, `is_error === true`, `subtype !== 'success'` (for example `error_max_structured_output_retries` [CITED: code.claude.com/docs/en/agent-sdk/structured-outputs], or the max-turns error), `structured_output` missing ("success but no structured_output" is documented as a failure case), and Zod failure. Then the soft check: `spines.length < spine_count_estimate * 0.8` is a **truncation warning** (keep the spines, flag the photo). Store `usage`, `total_cost_usd`, `modelUsage` and `duration_ms` on the run.

argv (extend `buildClaudeArgs` with `jsonSchema`, `effort` and `maxTurns`, and keep every hardening flag):
```
claude -p "<prompt incl. absolute path to vision.jpg>" --output-format json --model <vision_model>
  --no-session-persistence --strict-mcp-config --restricted --safe-mode --permission-mode dontAsk
  --tools Read --allowedTools Read --add-dir <DATA_DIR>/vision/<photoId>
  --json-schema '<draft-07 schema>' --effort <setting, default medium> --max-turns 6
```
The existing builder already emits `--tools Read --allowedTools Read --add-dir <dir>` when `readDirs` is non-empty [VERIFIED: src/server/claude/cli.ts:303-308]. Scope `--add-dir` to a **per-photo** directory containing only `vision.jpg`, so the Read scope is one image. `--max-turns` "Exits with an error when the limit is reached" [CITED: code.claude.com/docs/en/cli-reference]. Six allows Read, the structured-output turn and a couple of validation retries, while bounding quota.

### Pattern 5: Crop and rotate to horizontal (VIS-04)
For each kept detection: clamp `[x1,y1,x2,y2]` to `[0, vision_w] x [0, vision_h]` and drop zero-area or inverted boxes. Pad 15% of the short side (minimum 3 px) and 2% of the long side, then clamp. Scale to master space, `extract({left, top, width, height})` from **master.jpg**, then `.rotate(angle)` and `.webp({ quality: 85 })`. The extract comes before the rotate; sharp: "`.rotate(x).extract(y)` will produce a different result to `.extract(y).rotate(x)`" [VERIFIED: sharp 0.35.5 lib/index.d.ts]. sharp's explicit angle is clockwise:

| `text_orientation` | Meaning | sharp angle |
|---|---|---|
| `horizontal` | Reads left to right, upright | 0 |
| `upside_down` | Reads right to left, glyphs inverted (seen several times in the owner's photo) | 180 |
| `top_to_bottom` | Vertical, glyph tops face right | 270 (90° counter-clockwise) |
| `bottom_to_top` | Vertical, glyph tops face left | 90 |

The angle mapping is [ASSUMED] from geometry. Lock it with a synthetic fixture test (render "ABC" in each orientation with sharp/SVG, crop, assert by pixel sampling or a snapshot).

### Pattern 6: Versioned detections and stable spines (D-13..D-16)
Tables (names at the planner's discretion):
- `photos(id, sha256 UNIQUE, original_name, mime, bytes, original_path, master_path, master_w, master_h, vision_path, vision_w, vision_h, thumb_path, current_run_id, created_at)`
- `vision_runs(id, photo_id, run_no, UNIQUE(photo_id, run_no), model, effort, prompt_version, schema_version, max_edge, max_tokens, status ∈ {queued, preparing, calling, parsing, done, error}, error_reason, raw_path, usage_json, cost_usd, duration_ms, spine_count_estimate, density_flags_json, spawned_at, finished_at, created_at)`
- `spine_detections(id, run_id, idx, media_kind, bbox x1,y1,x2,y2 (vision px), text_orientation, legibility, raw ai fields+confidences json, crop_path, spine_id NULL)`. These are immutable after insert.
- `spines(id, photo_id, current_detection_id, state ∈ {active, superseded, orphaned, dismissed}, needs_review, created_at, updated_at)`
- `spine_fields(spine_id, field ∈ {artist,title,format,label,catalog_number,raw_text}, ai_value, value, confidence, ai_detection_id, updated_at, PK(spine_id, field))`

Merge rule on re-scan (one transaction):
- For a matched pair, set `spines.current_detection_id` to the new detection. For each field: if `value === ai_value` (not edited), set both to the new AI read. Otherwise keep `value` and set `ai_value` to the new read, so the UI shows "AI now reads X" beside the user value (D-15). The original read stays in the old `spine_detections` row (D-10: never lost).
- An unmatched old spine with no edited field becomes `superseded` (D-16).
- An unmatched old spine with any edited field becomes `orphaned`, with `needs_review=1` and its old crop kept.
- An unmatched new detection becomes a new spine.

Matching (D-14), O(n·m) with n ≤ ~100: `geo = max(IoU(a,b), 1 − centerDist(a,b) / (0.5·(shortSide(a)+shortSide(b))·3))` clamped to [0,1], computed in **normalized photo coordinates** (box ÷ vision dims, because the vision dims can differ between runs if the constants change). `text = 1 − lev(norm(a.raw), norm(b.raw)) / max(len)`. Then `score = 0.8·geo + 0.2·text`. Sort pairs descending and assign greedily one-to-one while `score ≥ cutoff` (start at 0.5). Use **2-D** IoU, not horizontal overlap only: the owner's shelves are two columns of stacked spines, so x-overlap alone pairs every spine in a column. Weights and cutoff are tuned on spike fixtures (record two runs of the same photo).

### Pattern 7: Polling without clobbering edits
- `useQuery({ queryKey: ['photos'], refetchInterval: (q) => q.state.data?.some(p => p.status === 'queued' || p.status === 'analyzing' || p.status === 'preparing') ? 1500 : false })`. The same applies to spines while their photo is active.
- Each `SpineField` keeps a local `draft` and an `isEditing` flag. While focused or dirty, it **ignores** incoming server values for that field. On blur: `useMutation` PATCH with `onMutate` → `queryClient.cancelQueries(['spines', ...])` plus an optimistic `setQueryData`, and `onError` rolls back plus a toast. Debounce is only needed if you also autosave on idle typing. Blur-save alone satisfies D-08.
- PATCH body is a Zod discriminated union: `{ field, value: string|null }` or `{ field, revert: true }`. The server never touches `ai_value`.

### Pattern 8: File-serving route
`GET /api/files/[...path]`: join the segments, then require that the first segment is in `{ 'crops', 'thumbs', 'vision' }` (the allowlist), then `resolveData(rel)` (it rejects absolute paths, `..` escapes and sibling-prefix tricks [VERIFIED: src/server/storage/paths.ts:44]), then `fs.stat` and stream via `Readable.toWeb(fs.createReadStream(abs))`. Set the `Content-Type` from the extension allowlist (`.webp`, `.jpg`), `X-Content-Type-Options: nosniff`, and `Cache-Control: private, max-age=31536000, immutable`. Names embed run and detection IDs, so content never changes under a URL. Do not serve `photos/` originals (HEIC is not browser-renderable anyway).

### Anti-Patterns to Avoid
- **Retrying a scan job after the spawn.** The default `max_attempts` is 3 (`maxAttempts: integer('max_attempts').notNull().default(3)` [VERIFIED: src/server/db/schema.ts:17]). Boot recovery requeues interrupted `running` jobs. Either path re-sends the photo, which violates D-17. See Pitfall 3.
- **Cropping from the raw upload or from un-oriented pixels.** Always crop from the oriented master (or the vision image), never from the original bytes.
- **Scaling to "2576 on the long edge"** without the token check.
- **A `minimum`/`maximum`/`minItems` in the CLI schema.** Validation failures re-prompt the model (extra quota) and can end in `error_max_structured_output_retries`. Validate and clamp in code. Note that `z.number().int()` emits `"maximum":9007199254740991` [VERIFIED: local zod run], so post-process the schema to strip numeric bounds, or use `z.number()` and round in code.
- **Horizontal-only overlap for matching, and "left-to-right order" for density.** Both break on the owner's two-column stacked layout.
- **Decoding HEIC in the upload route.** It blocks the event loop for about 2 s per photo (measured).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Model-space image size | "long edge ≤ 2576" math | The official `resizedSize` (copied verbatim, with `roundTiesToEven`) | Token-budget binding and half-even rounding. A hand version misaligns every box |
| HEIC decode | Shelling out to `magick`/`heif-convert` | `heic-decode` | Portable WASM, locked by D-05 |
| EXIF orientation | Reading the Orientation tag yourself | `sharp().autoOrient()` | Handles mirrored orientations, and `metadata().autoOrient.width/height` gives oriented dimensions |
| JSON Schema | A hand-written schema string | `z.toJSONSchema(Schema, { target: 'draft-07' })` | One source for the CLI schema and the parse-time validation |
| Child process lifecycle | A new spawn wrapper | `runProcess` plus `buildClaudeArgs`/`buildClaudeEnv`/`claudeWorkDir` | Env scrub, private cwd, group kill and abort are already reviewed (CR-01, WR-03..06) |
| Job exactly-once | Ad-hoc flags | `dedupe_key` plus `isCurrent()` plus the `vision_runs` ledger state machine | Mixing these up yields duplicate paid calls |
| Drag-drop, MIME filtering | Native `onDrop` | react-dropzone | Folder drops, keyboard access, `accept` map |
| Levenshtein | — | Hand-roll (about 20 lines, two-row DP) | CONTEXT explicitly says no dependency |

**Key insight:** Every hard bug in this phase is a coordinate-space or retry-semantics bug. Both are cheap to prevent with fixtures and a ledger, and expensive (paid re-runs) to find later.

## Common Pitfalls

### Pitfall 1: Proxy silently truncates uploads over 10 MB
**What goes wrong:** A 12 MB JPEG uploads "successfully". sharp then fails with a truncated-JPEG error, or worse, decodes a partially grey image.
**Why:** "When proxy is used, Next.js automatically clones the request body and buffers it… By default, the maximum body size is **10MB**… The request will **not** fail or return an error to the client" [VERIFIED: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md]. This repo has `src/proxy.ts` matching every route.
**How to avoid:** Set `experimental.proxyClientMaxBodySize: '64mb'`. In the route, compare the bytes read with `Content-Length` and return 413/400 on mismatch. Use sharp `failOn: 'error'` (rather than 'none') on decode.
**Warning signs:** The dev console logs a body-limit warning naming `/api/photos`.

### Pitfall 2: The CLI pixel space differs from the API's
**What goes wrong:** The boxes come back scaled (for example by 2000/2576) and every crop drifts toward the bottom-right.
**Why:** The Read tool "resizes and recompresses large images to fit the model's image size limits… An image that is still larger than 500KB after that resize is re-encoded as a JPEG at reduced quality with its pixel dimensions unchanged" [CITED: code.claude.com/docs/en/tools-reference]. Older third-party reports describe a 2000 px Read cap and file-size-driven downsampling. Issue #58233 (downsampling by bytes) was reported resolved on 2026-06-10, per the search snippet; the page itself was unreachable [ASSUMED].
**How to avoid:** Pre-size with the official algorithm and keep vision.jpg at or under 500 KB (388 KB measured at q90 on the real photo). The **Wave 0 calibration** renders a synthetic 1449x2576 and 2212x1659 JPEG with numbered rectangles at known coordinates and asks for their boxes through the exact production argv. Pass if the median corner error is ≤ 1.5% of the short edge. Also add `image_width`/`image_height` to the schema ("the pixel size of the image you see") as a per-call drift detector. Its reliability is [ASSUMED], so treat a mismatch as a warning, not an error.
**Warning signs:** Overlay boxes are good at the top-left and drift at the bottom-right. The reported image size ≠ vision dims.

### Pitfall 3: Retries and crash recovery cause a second paid call
**What goes wrong:** A parse bug throws, `failOrRetry` requeues with backoff, and the photo is sent to Claude 3 times. Or the server is killed mid-call, boot recovery requeues, and the photo is sent again.
**Why:** Phase 1 D-14 semantics are retry-by-default. `recoverRunningJobs` requeues `running` jobs unless attempts ≥ max_attempts.
**How to avoid:** (a) Extend `enqueue()` with an optional `maxAttempts`. Scan jobs use `1`, so recovery marks them `failed: 'interrupted after final attempt'`. (b) The handler never throws after the spawn. It catches everything, records `vision_runs.status='error'` plus a reason, and returns normally. (c) A boot and reaper reconciliation turns any `vision_runs` row in `queued/preparing/calling/parsing` whose job is `failed` into `error` with a reason, so the UI never shows "analyzing" forever. (d) The ledger CAS in Pattern 4 blocks a second spawn even if a job is somehow re-run. Before the spawn, a retry is harmless, but keep `maxAttempts=1` for simplicity. The UI's re-scan button is the retry.
**Warning signs:** More than one `run-*.json` or `spawned_at` for the same `run_no`. The `jobs.attempts > 1` count for `scan_photo`.

### Pitfall 4: Double rotation or no rotation on HEIC
**What goes wrong:** iPhone landscape HEIC crops come out rotated by 90°.
**Why:** HEIC orientation lives in the container (`irot`/`imir`), not the pixel data. libheif applies the transforms by default [ASSUMED for libheif-js defaults]. Raw RGBA handed to sharp carries no EXIF, so `.autoOrient()` is a no-op there, which is the correct behaviour (no double rotation).
**How to avoid:** The spike checks one landscape and one portrait iPhone HEIC. `heif-info` on the current fixture reports `transformations: angle (ccw): 0`, so it does not exercise `irot` [VERIFIED: local heif-info]. Assert in tests that `normalize(heic)` dimensions equal `heif-info`'s rotated dimensions.

### Pitfall 5: Dense shelves give tiny spines, misreads and truncation
**What goes wrong:** On the owner's photo (about 70 spines, 2 columns), each spine is about 35 px tall at 1449x2576. Titles get "completed" from prior knowledge, and the output may hit the turn or token budget.
**How to avoid:** Use `raw_text` plus `legibility` in the schema, the `spine_count_estimate` cross-check, and D-03 density flags computed layout-agnostically (count > N, median **short side** < W px, any pair with IoU > 0.3). The Upload tip suggests narrower sections. Consider setting `CLAUDE_CODE_MAX_OUTPUT_TOKENS` in the spawn env if the spike shows truncation. It is documented as "Set the maximum number of output tokens for most requests… Claude Code lowers a value above a model's cap to the cap" [CITED: code.claude.com/docs/en/env-vars].
**Warning signs:** `spines.length` well below `spine_count_estimate`. Many `partial` legibility values on confidently filled titles.

### Pitfall 6: Polling overwrites a field mid-edit
**How to avoid:** The Pattern 7 dirty/focus guard, plus `cancelQueries` in `onMutate`. Never re-key the input on refetch.

### Pitfall 7: The orientation enum is too narrow
**What goes wrong:** Upside-down spines (several in the owner's photo: "SUMMERS END", "THE HIVES – a.k.a. I-D-I-O-T", "anticon") get rotated the wrong way or left inverted.
**How to avoid:** Use the 4-value enum in Pattern 5, and ask the prompt to describe the orientation of the **text glyphs**, not of the case.

### Pitfall 8: Axis-aligned boxes on tilted spines
**What goes wrong:** Spines in a box lean a few degrees, so a padded axis-aligned box includes slivers of the neighbours. That is acceptable for the review UI.
**How to avoid:** Keep the long-axis padding small. Do **not** add a rotation-angle field to the schema in v1 (more output tokens, unverified accuracy).

## Code Examples

### Official resize (copy verbatim; the source is TypeScript)
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/vision-coordinates (reference implementation)
function countImageTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}
function roundTiesToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}
export function resizedSize(width: number, height: number, maxEdge = 1568, maxTokens = 1568): [number, number] {
  const fits = (w: number, h: number): boolean =>
    Math.ceil(w / 28) * 28 <= maxEdge && Math.ceil(h / 28) * 28 <= maxEdge && countImageTokens(w, h) <= maxTokens;
  if (fits(width, height)) return [width, height];
  if (height > width) { const [rh, rw] = resizedSize(height, width, maxEdge, maxTokens); return [rw, rh]; }
  const aspectRatio = width / height;
  let lo = 1; let hi = width;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, Math.max(roundTiesToEven(mid / aspectRatio), 1))) lo = mid; else hi = mid;
  }
  return [lo, Math.max(roundTiesToEven(lo / aspectRatio), 1)];
}
// Tests: resizedSize(1075,1520) → [924,1307]; resizedSize(3840,2160,2576,4784) → [2576,1449] (docs table)
```

### HEIC decode to sharp (probed this session)
```typescript
// Source: heic-decode README usage `const { width, height, data } = await decode({ buffer })` + local probe
import decode from 'heic-decode';
import sharp from 'sharp';
const { width, height, data } = await decode({ buffer: original }); // Uint8ClampedArray RGBA
const img = sharp(data, { raw: { width, height, channels: 4 } }).removeAlpha();
```

### Vision schema sketch (freeze after the spike; field names at the planner's discretion)
```typescript
const Field = z.object({ value: z.string().nullable(), confidence: z.number() }); // 0..1, clamp in code
export const SpineDetection = z.object({
  index: z.number(),
  media_kind: z.enum(['cd', 'dvd', 'bluray', 'vinyl', 'cassette', 'game', 'book', 'other', 'unsure']),
  bbox: z.array(z.number()),            // [x1,y1,x2,y2] absolute px in the image you see; length checked in code
  text_orientation: z.enum(['horizontal', 'upside_down', 'top_to_bottom', 'bottom_to_top']),
  legibility: z.enum(['clear', 'partial', 'illegible']),
  raw_text: Field, artist: Field, title: Field, format: Field, label: Field, catalog_number: Field,
});
export const VisionResult = z.object({
  image_width: z.number(), image_height: z.number(), spine_count_estimate: z.number(),
  spines: z.array(SpineDetection),
});
export const visionJsonSchema = z.toJSONSchema(VisionResult, { target: 'draft-07' });
```
Keep `cd` and `unsure` as spines. Store the other media kinds only as detections (the D-domain says non-CD spines are ignored, but keeping them in `spine_detections` aids re-scan matching and auditing).

### Field allowlist values (verbatim, in-repo)
- Lanes: `lane: text('lane', { enum: ['anthropic', 'discogs'] }).notNull(),` [VERIFIED: src/server/db/schema.ts:8]
- Job statuses: `enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],` [VERIFIED: src/server/db/schema.ts:12]
- Data subdirs: `export const SUBDIRS = [ 'photos', 'vision', 'crops', 'thumbs', 'backups', ] as const;` [VERIFIED: src/server/storage/paths.ts:6-12]
- Models: `{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },` and `const VISION_MODEL_KEY = 'vision_model';` [VERIFIED: src/server/settings.ts:11-23]
- Handler registry: `noop: { run: runNoop, timeoutMs: 120000 },` [VERIFIED: src/server/jobs/handlers/index.ts:6]. Add `scan_photo: { run: runScanPhoto, timeoutMs: 600_000 }`. Note that `strandedAfterMs()` uses the longest handler timeout, so reaping slows to about 10.6 min (acceptable).
- Lane concurrency: `anthropic: 1,` [VERIFIED: src/server/jobs/worker.ts:24], so one CLI call at a time.
- Process stdout cap: `const maxBuffer = opts.maxBuffer ?? 1_000_000;` and `stdio: ['ignore', 'pipe', 'pipe'],` [VERIFIED: src/server/proc/run.ts:71,103]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SDK `messages.parse` + `output_config.format` (STACK.md) | CLI `--json-schema` gives `structured_output` | D-18 (Phase 1) | No `stop_reason` field. Branch on `is_error`/`subtype`/`structured_output` presence |
| "Resize to 2576 long edge" | Official `resizedSize` with the token budget | Current docs | Most photos are token-bound (about 2212x1659 for 4:3, 1449x2576 for 9:16) |
| `middlewareClientMaxBodySize` | `experimental.proxyClientMaxBodySize` (Next 16 `proxy.ts`) | Next 16 | Default 10 MB silent truncation |
| Normalized coordinate prompts | Absolute pixels `[x1,y1,x2,y2]` | Claude 4.7+ docs | Ask for pixels only |

**Deprecated/outdated for this project:** STACK.md's `server-side-fallback` beta, `output_config.effort` and `messages.parse` notes (they are SDK-only). Use the CLI `--effort` flag (`low, medium, high, xhigh, max` per installed `--help`) [VERIFIED: claude 2.1.289 --help].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The CLI Read path delivers a pre-sized image (≤ tier limits, ≤ 500 KB) to the model at unchanged pixel dimensions, so boxes are 1:1 | Pattern 3, Pitfall 2 | Every crop is misaligned. The spike calibration gates this; fall back to coordinate rescale or stream-json input |
| A2 | `--json-schema` validation failures re-prompt (extra quota), so numeric bounds in the schema are harmful | Anti-patterns | Low. Stripping bounds is harmless either way |
| A3 | libheif-js applies `irot`/`imir` by default | Pitfall 4 | Landscape HEICs come out rotated. Spike test with a landscape HEIC |
| A4 | The sharp angle mapping per `text_orientation` (Pattern 5 table) | Pattern 5 | Crops come out upside-down. A fixture test catches it |
| A5 | **Crops are cut from the full-res upright master via an exact scale, not from the 1449x2576 vision image.** INGEST-05 says "the image sent to Claude is the same image crops are cut from". The vision image is a pure resize of the master, so geometry is identical, and master crops are about 3x sharper (spines are about 35 px tall in vision space) | Pattern 3/5 | If the owner reads INGEST-05 literally, crop from vision.jpg instead (a one-line change). **Needs owner confirmation** |
| A6 | Self-reported `image_width`/`image_height` and confidences are informative | Pitfall 2, D-09 | They may be uncalibrated. Treat them as warnings only and tune the threshold from the spike |
| A7 | GitHub issue #58233 (byte-based downsampling) is fixed in the installed CLI 2.1.289 | Pitfall 2 | The calibration includes a >500 KB variant to detect it |
| A8 | Tests over owner photos in gitignored `fixtures/spike/` must `skipIf` the files are absent. Recorded CLI JSON plus synthetic images are committed (under `test/fixtures/vision/`) | Validation | Without this, a fresh clone or CI fails |

## Open Questions

1. **Crop source (A5).** Recommendation: master crops. Confirm with the owner at the plan checkpoint.
2. **Default effort.** `medium` versus `high`. The spike measures the misread rate against the quota and latency per photo.
3. **Should scan jobs ever auto-retry before the spawn** (for example a transient sharp error)? Recommendation: no (`maxAttempts=1`). The user re-scans. This keeps one rule: no automatic re-sends.
4. **Event-loop blocking.** HEIC decode blocks about 2 s per photo (measured). It is acceptable for a single user. If polling stutters noticeably, move the decode to `worker_threads` later.
5. **Colour profile.** Raw RGBA from heic-decode loses the Display-P3 ICC profile, so colours shift slightly. This does not affect reading. Ignore it in v1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime, react-dropzone `engines >=22` | ✓ | v22.22.1 | — |
| pnpm (via corepack) | install | ✓ (corepack 0.34.6; `pnpm` not on PATH directly) | 12.14.0 pinned | `corepack pnpm …` |
| Claude Code CLI | vision call | ✓ | 2.1.289, logged in `authMethod: "claude.ai"`, `subscriptionType: "max"` | — |
| sharp prebuilt (linux-x64) | image pipeline | ✓ | 0.35.5, libvips 1.3.4. HEIF input supports `.avif` only, **no HEIC** (verified `sharp.format.heif`) | heic-decode |
| heic-decode / libheif-js | HEIC | ✓ (probed in scratchpad) | 2.1.0 / 1.23.5 | "Most Compatible" JPEG instruction |
| Spike photos | D-01 | Partial: 1 of 3-5 (`fixtures/spike/cd-spines.heic`, 4536x8064, about 70 spines, gitignored ✓) | — | Owner adds a sparse and a ~40-spine photo, plus one landscape HEIC |

**Missing dependencies with no fallback:** none.
**Missing with fallback:** extra spike photos. The planner adds a `checkpoint:human-action` for the owner to drop them.

## Security Domain

### Applicable ASVS Categories (Level 1)
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Loopback-only single user (Phase 1) |
| V3 Session Management | no | — |
| V4 Access Control | yes | Existing `proxy.ts` Host, Origin and `sec-fetch-site` guard covers the new POST and PATCH routes. The file route is GET-only with an allowlisted subdir |
| V5 Input Validation | yes | Magic bytes plus MIME, a size cap and length match, sharp `failOn: 'error'` and `limitInputPixels` (default), Zod on PATCH bodies, Zod on CLI output |
| V6 Cryptography | yes (hash only) | `node:crypto` `createHash('sha256')`. Never hand-roll |
| V12 Files and Resources | yes | `resolveData()` for every path, content-addressed or ULID file names (the user filename is never used as a path), and `X-Content-Type-Options: nosniff` |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via the file route or `x-filename` | Tampering / Info disclosure | Subdir allowlist plus `resolveData`. The filename is stored only as display text, length-capped and stripped of control characters |
| Decompression bomb / huge HEIC | DoS | 64 MB body cap, sharp `limitInputPixels` default (about 268 MP), and a check on HEIC dims from `heif-info`-equivalent metadata after decode (reject > 100 MP) |
| Prompt injection via text printed on a spine | Tampering | Tools limited to `Read` scoped to a per-photo dir. `--restricted --safe-mode --strict-mcp-config` (existing). Output is schema-validated data only and is never executed |
| Cross-site upload or PATCH from a malicious page | Spoofing / CSRF | Existing Origin and fetch-metadata guard (verified for mutations) |
| Quota exhaustion via repeated re-scan | DoS (cost) | Confirm dialog, server-side "no active run" guard, `maxAttempts=1`, and `--max-turns 6` |
| Secrets leaking to the CLI | Info disclosure | Existing `buildClaudeEnv()` strips `API_BILLING_ENV` and app secrets. Any added env var (for example `CLAUDE_CODE_MAX_OUTPUT_TOKENS`) is added after the scrub |

## Sources

### Primary (HIGH confidence)
- In-repo source read this session: `src/server/claude/cli.ts`, `src/server/proc/run.ts`, `src/server/jobs/{queue,worker,types}.ts`, `src/server/jobs/handlers/*`, `src/server/db/schema.ts`, `src/server/storage/paths.ts`, `src/server/settings.ts`, `src/proxy.ts`, `vitest.config.ts`, `pnpm-workspace.yaml`, `next.config.ts`
- `node_modules/next/dist/docs/.../proxyClientMaxBodySize.md` (Next 16.4.2 bundled docs)
- `claude --help` (2.1.289) and a local probe of the stream-json flag combination
- Local probes: heic-decode on `fixtures/spike/cd-spines.heic`, sharp JPEG/WebP sizes at 1449x2576, `heif-info`, `sharp.format.heif`, `z.toJSONSchema` output
- npm registry (`npm view`), and `gsd-tools package-legitimacy check`

### Secondary (MEDIUM confidence)
- https://code.claude.com/docs/en/headless.md: `--json-schema` gives `structured_output`
- https://code.claude.com/docs/en/agent-sdk/structured-outputs.md: `error_max_structured_output_retries`, success-without-output, draft-07
- https://code.claude.com/docs/en/cli-reference.md: `--max-turns`, `--effort`, `--input-format`
- https://code.claude.com/docs/en/tools-reference.md: Read-tool image resize and the 500 KB re-encode
- https://code.claude.com/docs/en/env-vars.md: `CLAUDE_CODE_MAX_OUTPUT_TOKENS`
- https://platform.claude.com/docs/en/build-with-claude/vision and /vision-coordinates: tiers, token formula, `resizedSize`

### Tertiary (LOW confidence)
- claudeissues.com #58233 and #53170 (search snippets only, page unreachable): byte-based downsampling and the 2000 px multi-image cap

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions come from the registry, and HEIC decode was probed on a real file.
- Architecture: HIGH for the seams and ledger (grounded in the Phase 1 code). MEDIUM for match weights (spike-tuned).
- Pitfalls: HIGH for proxy truncation, retries and resize math (verified). MEDIUM for CLI pixel space and orientation mapping (spike and fixture gated).

**Research date:** 2026-10-19
**Valid until:** 2026-11-02 (14 days; the CLI moves fast. Re-check `claude --help` and the tools-reference image notes at plan time)
