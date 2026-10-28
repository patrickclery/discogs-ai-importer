# Phase 5: Stubbed Demo Site - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A public, fully static demo of the real app that anyone can open on GitHub Pages and click through end to end (upload, review spines, see Discogs matches, confirm, "import", filter, retry, not on Discogs). It never calls Claude or Discogs, has no server, no database and no persistence: every visitor always sees exactly the same starting state, interactions only appear to change things (in-memory, reset on reload). The real local app's behaviour must not change.

</domain>

<decisions>
## Implementation Decisions

### Hosting and build
- Hosted on GitHub Pages, published from THIS repo (public) by a GitHub Actions workflow, served at `https://patrickclery.github.io/discogs-ai-importer/` (owner's user-site domain; no copying builds into the `patrickclery` Pages repo).
- Same app, not a fork: a demo build switch (e.g. `NEXT_PUBLIC_DEMO=1`) produces a Next.js static export (`output: 'export'`, `basePath`/`assetPrefix` `/discogs-ai-importer`) using the real components.
- No server, no SQLite, no API routes, no server actions, no `secrets.json` in the demo build. Every request the UI would make to `/api/...` is answered in the browser by a mock layer from bundled, immutable fixture data.
- Edits are memory-only: clicks look like they edit/scan/import, but state lives in page memory and resets on reload. No localStorage/IndexedDB persistence.
- A thin banner on every page: "Demo — Claude and Discogs are simulated. Changes reset when you reload."

### Demo content
- Sample shelf: the owner's own photo `fixtures/spike/cd-spines.heic` (Nine Inch Nails, Atmosphere, Massive Attack, Kid606, Venetian Snares… — the owner's collection; the other spike photos are the owner's mother's collection and must NOT be used or published).
- Spine data: Claude's real saved read of that photo (`test/fixtures/vision/spike/cd-spines.claude-opus-5-5.high.json`, 61 spines, 1449x2576 sent image). All 61 spines are shown. The vision JPEG and the horizontal spine crops are generated once with the real pipeline (sharp/crop code) at fixture-build time and committed as static assets; the original HEIC is not published.
- Cover thumbnails: plain generated covers (artist and title on a coloured tile). No Discogs images are re-hosted.
- Preloaded states, at least one of each: pending, matched, imported, not found, not on Discogs, failed (search and import), already-in-collection warning, and duplicate-across-spines warning.

### Stubbed behaviour
- Discogs matches: recorded once by the developer from real Discogs searches for those 61 spines (text only: title, year, country, labels, catalog number, formats, release id) into committed fixtures. The demo replays them and never contacts Discogs at runtime.
- Upload page: dropping any photo plays a fake ~3 s "analyzing" state and then shows the sample shelf. Nothing is uploaded anywhere; the dropped file is never read beyond its name.
- Settings page: Claude CLI shows "ready" and Discogs shows "Connected as demo-user"; every button (test, connect, disconnect, folder select, model) is simulated.
- Search Discogs dialog: searches only within the recorded fixtures; pasting a release link/number returns a canned release.
- Re-scan, retry, retry-all, change match, not on Discogs, link existing / add another copy: all simulated in memory with realistic short delays and the same status transitions as the real app.

### Follow-up decisions (after research, 2026-10-23)
- Mock mechanism: in-browser fetch shim (not Mock Service Worker) — works over http and https.
- The owner will turn on "Enforce HTTPS" for patrickclery.com themselves; the demo must work either way.
- A photo dropped on the demo Upload page becomes a fresh second copy of the sample shelf (its own 61 spines), after the fake ~3 s analyzing.
- Spine crops are downscaled for the demo (keep them readable; total well under the 3.3 MB full-resolution size).
- The agent enables GitHub Pages (source: GitHub Actions) with one `gh api` call at deploy time; the workflow triggers on `master`.
- Demo builds run in CI only (a local demo build would wipe the real `.next` production build).

### Claude's Discretion
- Mock mechanism (e.g. Mock Service Worker vs a fetch shim vs swapping TanStack Query fetchers), as long as the real local build is unaffected and the demo bundle contains no server code.
- How server components / server actions (`/upload` server-renders `listPhotos()`, `/settings` uses server actions) get demo-safe client equivalents in the static export.
- Fixture recording script shape and where fixtures live (e.g. `demo/fixtures/`).
- Exact delays, which spines carry which seeded state.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test/fixtures/fake-claude.mjs` and `test/fixtures/fake-discogs.mjs`: existing fakes (CLI and HTTP server) — useful references for response shapes; the static demo cannot run them at runtime.
- `test/fixtures/vision/spike/cd-spines.claude-opus-5-5.high.json`: the real read (stdout envelope with `structured_output.spines`, 61 entries: bbox, fields with values/confidence, raw_text, orientation).
- `test/fixtures/discogs/*.json`: Discogs search/release response shapes.
- Crop/normalize pipeline in `src/server` (sharp) to pre-render the vision JPEG and spine crops once.

### Established Patterns
- Client pages poll JSON routes via TanStack Query (`/api/spines`, `/api/photos`, `/api/status`); spine DTOs and review statuses are computed server-side today.
- Env seams already exist: `CLAUDE_BIN`, `DISCOGS_API_BASE`, `DISCOGS_WEB_BASE`, `DISCOGS_IMAGE_BASE`.
- shadcn/ui + Tailwind v4 components; images served through `/api/files/...` and `/api/discogs/thumb/...` routes (demo must map these to static assets).

### Integration Points
- Pages: `src/app/{page,upload,spines,settings}/page.tsx`, `layout.tsx` (banner).
- API surface the mock must cover: `/api/status`, `/api/photos`, `/api/photos/[id]/rescan`, `/api/spines`, `/api/spines/[id]/{fields,reattach,dismiss,candidates,search,import,import/link-existing,import/another,retry,not-on-discogs}`, `/api/spines/retry-failed`, `/api/discogs/{connect,callback,test,disconnect,finish,folders,thumb/[id],searches/[id],searches/[id]/thumb/[releaseId]}`, `/api/files/[...path]`, `/api/dev/jobs` (likely hidden in demo), plus `src/app/settings/actions.ts` server actions.
- `next.config.ts`: needs a demo-only static export config.

</code_context>

<specifics>
## Specific Ideas

- "Completely immutable results so that it's always the exact same thing and there's nothing people can actually do. It just looks like it's getting edited when they click the buttons."
- Use only the owner's shelf photo (`cd-spines.heic`, the one with Nine Inch Nails and Atmosphere); the other photos belong to the owner's mother.

</specifics>

<deferred>
## Deferred Ideas

- Hosted server-backed demo (Fly/Render/Docker) — not wanted.
- A recorded walkthrough video/GIF for the README — possible later addition.

</deferred>
