# Phase 5: Stubbed Demo Site - Research

**Researched:** 2026-10-23
**Domain:** Next.js 16 static export (`output: 'export'`) of an existing server-backed App Router app; an in-browser mock of its JSON API; GitHub Pages deploy through GitHub Actions
**Confidence:** HIGH. The core mechanism was proven with a real `next build` of this codebase in a scratch copy, then served under the basePath and rendered in headless Chrome.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Hosting and build
- Hosted on GitHub Pages, published from THIS repo (public) by a GitHub Actions workflow, served at `https://patrickclery.github.io/discogs-ai-importer/` (owner's user-site domain; no copying builds into the `patrickclery` Pages repo).
- Same app, not a fork: a demo build switch (e.g. `NEXT_PUBLIC_DEMO=1`) produces a Next.js static export (`output: 'export'`, `basePath`/`assetPrefix` `/discogs-ai-importer`) using the real components.
- No server, no SQLite, no API routes, no server actions, no `secrets.json` in the demo build. Every request the UI would make to `/api/...` is answered in the browser by a mock layer from bundled, immutable fixture data.
- Edits are memory-only: clicks look like they edit/scan/import, but state lives in page memory and resets on reload. No localStorage/IndexedDB persistence.
- A thin banner on every page: "Demo — Claude and Discogs are simulated. Changes reset when you reload."

#### Demo content
- Sample shelf: the owner's own photo `fixtures/spike/cd-spines.heic` (Nine Inch Nails, Atmosphere, Massive Attack, Kid606, Venetian Snares… — the owner's collection; the other spike photos are the owner's mother's collection and must NOT be used or published).
- Spine data: Claude's real saved read of that photo (`test/fixtures/vision/spike/cd-spines.claude-opus-5-5.high.json`, 61 spines, 1449x2576 sent image). All 61 spines are shown. The vision JPEG and the horizontal spine crops are generated once with the real pipeline (sharp/crop code) at fixture-build time and committed as static assets; the original HEIC is not published.
- Cover thumbnails: plain generated covers (artist and title on a coloured tile). No Discogs images are re-hosted.
- Preloaded states, at least one of each: pending, matched, imported, not found, not on Discogs, failed (search and import), already-in-collection warning, and duplicate-across-spines warning.

#### Stubbed behaviour
- Discogs matches: recorded once by the developer from real Discogs searches for those 61 spines (text only: title, year, country, labels, catalog number, formats, release id) into committed fixtures. The demo replays them and never contacts Discogs at runtime.
- Upload page: dropping any photo plays a fake ~3 s "analyzing" state and then shows the sample shelf. Nothing is uploaded anywhere; the dropped file is never read beyond its name.
- Settings page: Claude CLI shows "ready" and Discogs shows "Connected as demo-user"; every button (test, connect, disconnect, folder select, model) is simulated.
- Search Discogs dialog: searches only within the recorded fixtures; pasting a release link/number returns a canned release.
- Re-scan, retry, retry-all, change match, not on Discogs, link existing / add another copy: all simulated in memory with realistic short delays and the same status transitions as the real app.

### Claude's Discretion
- Mock mechanism (e.g. Mock Service Worker vs a fetch shim vs swapping TanStack Query fetchers), as long as the real local build is unaffected and the demo bundle contains no server code.
- How server components / server actions (`/upload` server-renders `listPhotos()`, `/settings` uses server actions) get demo-safe client equivalents in the static export.
- Fixture recording script shape and where fixtures live (e.g. `demo/fixtures/`).
- Exact delays, which spines carry which seeded state.

### Deferred Ideas (OUT OF SCOPE)
- Hosted server-backed demo (Fly/Render/Docker) — not wanted.
- A recorded walkthrough video/GIF for the README — possible later addition.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are assigned (there is no active REQUIREMENTS.md). These must-haves are derived from the CONTEXT.md decisions; the planner should use them as the requirement set.

| ID (proposed) | Must-have | Research support |
|---|---|---|
| DEMO-01 | `NEXT_PUBLIC_DEMO=1 next build` produces a static export under basePath `/discogs-ai-importer`. The default build is byte-for-byte unaffected in behaviour. | Pattern 1 (`pageExtensions` switch), proven by a spike build |
| DEMO-02 | No route handlers, server actions, proxy, instrumentation, SQLite, sharp or secrets are in the demo output | Pattern 1 + the alias seams; Validation: manifest and chunk checks |
| DEMO-03 | Every client `/api/...` call is answered in the browser from in-memory state that resets on reload | Pattern 2 (fetch shim + demo route table), proven in headless Chrome |
| DEMO-04 | The sample shelf is the owner's photo only: vision JPEG, thumb and 61 crops from the real pipeline, no HEIC, no metadata | Pattern 4, proven (1449x2576, 481377 bytes, 61 crops, no EXIF) |
| DEMO-05 | Discogs candidates are recorded once (text only) by a local script using the real cascade code | Pattern 5 |
| DEMO-06 | Generated covers, not Discogs images | Pattern 4 (covers) + asset-URL seam |
| DEMO-07 | Seeded states: one or more of each review status, plus the already-in-collection and duplicate warnings | Pattern 3 (seed plan) |
| DEMO-08 | Upload, settings, search dialog, re-scan, retry, retry-all, change match, not on Discogs, link existing and add another all work in memory, with the real status transitions | Pattern 3 (lazy time transitions) + endpoint table |
| DEMO-09 | Banner on every page | `layout.demo.tsx` |
| DEMO-10 | A GitHub Actions workflow publishes to Pages from `master`, and the Pages source is set to "GitHub Actions" | Pattern 6 |
</phase_requirements>

## Summary

A Next 16 static export of this app works with one config switch. Under `NEXT_PUBLIC_DEMO=1`, `next.config.ts` returns a separate config: `output: 'export'`, `basePath: '/discogs-ai-importer'`, `trailingSlash: true`, `pageExtensions: ['demo.tsx', 'demo.ts']`, and a Turbopack `resolveAlias` for the few client-imported server seams. With `pageExtensions` set to `demo.*`, Next only sees `*.demo.tsx` route files. Every `src/app/api/**/route.ts`, `src/proxy.ts`, `src/instrumentation.ts`, the real `page.tsx` and `layout.tsx` files, and the `loading.tsx` files disappear from the demo build, and the default build never sees the `.demo.tsx` files. I proved this with a real build of this repo in a scratch copy. All five demo routes prerendered as static (`○`). `server-reference-manifest.json` had `"node": {}` (the real build lists the `src/app/settings/actions.ts` actions). The middleware manifest was empty, and no request reached `/api` on the static server.

**Primary recommendation:**
- **Mock layer: a window.fetch shim, not MSW.** It is installed by a `'use client'` demo root component that the demo layout renders. It routes `/api/*` requests to an in-memory "demo server", which is a route table plus a store seeded from committed fixtures. Every network call in the client is a relative `fetch('/api/...')` (25 call sites, enumerated below), so the shim covers all of them with zero component changes.
- **MSW is rejected:**
  - The demo URL redirects to plain HTTP. `patrickclery.github.io` has the custom domain `patrickclery.com` with "Enforce HTTPS" off, so `https://patrickclery.github.io/discogs-ai-importer/` 301-redirects to `http://patrickclery.com/discogs-ai-importer/`. Service workers need a secure context, so MSW cannot run there.
  - A service worker does not intercept `<a href>` navigations.
  - There is a first-load race to handle.
  - It adds a dependency.
- **Images:** they never go through the mock. Demo DTOs carry real static URLs under the basePath (`/discogs-ai-importer/demo-assets/...`). Three hard-coded image-URL sites go through a new client-safe seam module, `src/lib/asset-urls.ts`, which is aliased in the demo build.

**Fixtures:** the real pipeline (`normalizeImage` → `normalizeBox`/`padBox`/`scaleBox` → `cropSpine`), run on `cd-spines.heic` through a Vitest-hosted script, reproduces the saved read exactly: a 1449x2576 vision JPEG of 481377 bytes, the same byte count the recorded run sent. It also produces 61 crops (3.3 MB in total) with no EXIF, ICC or XMP metadata. Discogs candidates are recorded once by a second local script that calls the real `runCascade` + `discogsFetch` + `rankCandidates` + `toCandidateFromSearch` with the owner's `secrets.json` sign-in. It stores text only.

**Deploy:** `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`, `pnpm/action-setup@v6` (reads `packageManager: pnpm@12.14.0`) and `actions/setup-node@v7`. The workflow triggers on `master`, not `main`. Pages is not yet enabled on the repo (`GET /repos/.../pages` returns 404). Enable it once with `gh api -X POST repos/patrickclery/discogs-ai-importer/pages -f build_type=workflow`.

## Project Constraints (from CLAUDE.md)

- The app runs on port **3001**. Never start anything on port 3000 (Grafana). Do not start or stop the owner's dev server on 3001. Demo previews must use another port (the recommended `demo:preview` uses 4173).
- Next.js App Router + TypeScript; TypeScript pinned `~6.0.3` (`typescript: 6.0.3` in package.json). Do not move to TS 7.
- Native modules (`better-sqlite3`, `sharp`) are server-only. p-queue/ESM-only modules must not be imported by client code.
- Secrets are never committed. `secrets.json` is gitignored and must never be read by the demo build or reach `out/`.
- Recorded Claude/Discogs fixtures are used in tests, and tests never hit live APIs. The Discogs recording script is a developer-run tool, never part of `pnpm test`, the same as `spike:vision`.
- Biome 2.5 for lint and format (`pnpm lint` = `biome check`). Vitest 5 for unit tests (`src/**/*.test.ts`).
- GSD workflow enforcement: file changes go through GSD commands. Planning artifacts only in this phase.
- Owner memory: write UAT steps as plain do/see steps.
- Environment note from the orchestrator: `pnpm` is not on PATH. Use `node_modules/.bin/*` or `corepack pnpm`.

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Static HTML/JS for /, /upload, /spines, /settings | CDN / Static (GitHub Pages) | Build (`next build` export) | No server exists in the demo |
| Answering `/api/*` | Browser / Client (fetch shim + demo route table) | — | Locked: no server; memory-only state |
| Demo state (spines, imports, searches, connection) | Browser / Client (module-level store) | — | Reset on reload means page memory only |
| Review status, import phase, counts | Browser / Client, reusing the pure `src/lib` functions | — | `reviewStatusOf`, `importPhaseOf`, `canChangeMatchOf`, `canRetryOf` and `needsReview` are client-safe already |
| Vision JPEG, crops, thumb, covers | CDN / Static (committed assets copied into `out/`) | Developer machine (one-off generation with sharp) | sharp can never run in the browser or in CI for this |
| Discogs candidate data | Committed JSON (recorded once) | Developer machine (recording script) | No runtime Discogs calls |
| Settings server actions | Browser / Client (aliased demo module) | — | Server Actions are unsupported in static export |

## Standard Stack

### Core (all already installed; no new packages)

| Library | Version (installed) | Purpose in this phase | Why |
|---|---|---|---|
| next | 16.4.2 [VERIFIED: node_modules/next/package.json] | `output: 'export'`, `basePath`, `pageExtensions`, `turbopack.resolveAlias` | The same app, proven to export |
| react / react-dom | 19.3.1 | Unchanged | — |
| @tanstack/react-query | 5.104.2 | Unchanged; queries go through the shimmed `fetch` | No fetcher changes are needed |
| nuqs | 2.10.1 | URL filter state; works under basePath (spike: `/spines/?status=failed` sent `/api/spines?status=failed`) | — |
| sharp | 0.35.5 | Fixture-time only (crops, vision JPEG, thumb) | The real pipeline |
| heic-decode | 2.1.0 | Fixture-time only (decode `cd-spines.heic`) | The real pipeline |
| vitest | 5.0.5 | Demo store/route unit tests; it also hosts the fixture scripts (server-only stub + `@` alias) | The existing `spike:vision` pattern |

### Alternatives considered

| Instead of | Could use | Tradeoff (verdict) |
|---|---|---|
| fetch shim | `msw` 3.0.3 [VERIFIED: npm registry, latest 2026-10-10] | It needs a service worker, so it needs a secure context, and the Pages URL ends on `http://patrickclery.com/...` (verified with `curl -sI`). It does not intercept navigations (`<a href={crop.url}>`). It has a first-load race and adds a dependency. **Rejected.** |
| fetch shim | Swap TanStack Query fetchers / inject a client | 25 raw `fetch` call sites in mutations, not only queries, so every component changes. **Rejected.** |
| `pageExtensions` switch | Env checks inside the real `page.tsx` files | Real pages import `@/server/*` at module top, so the export would still bundle and prerender them and choke on `connection()`/`headers()`. Route handlers with POST also break export. **Rejected.** |
| Static asset URLs in DTOs | Keep `/api/files/...` URLs and serve copies there | `<img src="/api/...">` has no basePath, so it resolves to `patrickclery.com/api/...` (not this site). **Rejected.** |
| Runtime SVG data-URI covers | Pre-generated SVG files | Either works. Pre-generated `.svg` files keep the seam a pure URL function. Recommended: generate `.svg` files at fixture time (text, tiny, no sharp needed). |

**Installation:** none. **Package Legitimacy Audit:** no new packages are installed in this phase. `msw` was evaluated and rejected, so no gate applies.

## Package Legitimacy Audit

| Package | Registry | Verdict | Disposition |
|---|---|---|---|
| (none added) | — | — | — |

**Packages removed due to [SLOP]:** none. **Packages flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────── BUILD TIME (developer, once) ───────────────────────────┐
fixtures/spike/      │  scripts/demo/build-assets.demo.ts (vitest host, server-only stubbed)              │
cd-spines.heic ──────┼─▶ normalizeImage ─▶ vision.jpg (1449x2576) + thumb.webp                             │
(gitignored)         │        └─▶ normalizeBox → padBox → scaleBox → cropSpine ─▶ crops/NN.webp (61)       │
saved Claude read ───┼─▶ classifyVisionRun(run) ─▶ demo/fixtures/shelf.json (fields, conf, crop dims)     │
                     │  scripts/demo/record-discogs.demo.ts ─▶ runCascade(discogsFetch oauth) ─▶          │
secrets.json ────────┼─▶   rankCandidates → toCandidateFromSearch ─▶ demo/fixtures/discogs.json (text)    │
                     │  covers: per releaseId ─▶ demo/assets/covers/<releaseId>.svg                       │
                     └──────────────────────────────────────┬────────────────────────────────────────────┘
                                                            │ committed
                     ┌──────────────── CI (GitHub Actions on push to master) ──────────────┐
                     │ pnpm install → vitest (demo tests) → NEXT_PUBLIC_DEMO=1 next build   │
                     │ (pageExtensions demo.* : only *.demo.tsx routes; aliases for seams)  │
                     │ → copy demo/assets → out/demo-assets → verify-demo-export → upload   │
                     │ → deploy-pages                                                       │
                     └──────────────────────────────────┬──────────────────────────────────┘
                                                        ▼
 Browser ── GET /discogs-ai-importer/spines/ ─▶ GitHub Pages (static HTML/JS/RSC .txt/assets)
   │
   ├─ layout.demo.tsx renders <DemoRoot> ('use client') ── imports fetch-shim (side effect, runs first)
   │
   ├─ components call fetch('/api/spines?...') ──▶ fetch shim ──▶ demo route table (method + path)
   │                                                   │              │
   │                                                   │              ▼
   │                                                   │   demo store (seeded clone of fixtures,
   │                                                   │   lazy time-based transitions, pure lib
   │                                                   │   read-model fns) ──▶ Response(JSON, status)
   │                                                   └─ non-/api URLs → real fetch (RSC .txt, assets)
   ├─ <img>/<a> use DTO URLs = /discogs-ai-importer/demo-assets/... (plain static files)
   └─ settings server actions → aliased src/demo/settings-actions.ts → demo store
```

### Recommended Project Structure

```
demo/
├── fixtures/
│   ├── shelf.json            # 61 spines from the saved read: fields, confidence, legibility, orientation, crop dims
│   ├── discogs.json          # per-spine recorded cascade (text only) + canned releases for "paste a link"
│   └── seed.json             # which spine carries which seeded state (or a TS module in src/demo)
└── assets/                   # copied verbatim to out/demo-assets/ after build
    ├── vision.jpg            # 1449x2576, 481377 bytes
    ├── thumb.webp            # 90x160
    ├── crops/00.webp … 60.webp
    └── covers/<releaseId>.svg
src/demo/                     # client-only demo runtime (never imported by real code)
├── demo-root.tsx             # 'use client'; imports ./fetch-shim; renders banner + children
├── fetch-shim.ts             # window.fetch wrapper → routes.ts
├── routes.ts                 # pure: handle(method, url, headers, bodyText) → { status, body }
├── store.ts                  # seeded in-memory state + subscribe (useSyncExternalStore)
├── read-model.ts             # SpinesResponse / PhotosResponse / StatusResponse builders (reuse src/lib)
├── settings-actions.ts       # alias target for @/app/settings/actions
├── asset-urls.ts             # alias target for @/lib/asset-urls
└── *.test.ts                 # picked up by the existing vitest include src/**/*.test.ts
src/app/
├── layout.demo.tsx  page.demo.tsx  error.demo.tsx
├── upload/page.demo.tsx  spines/page.demo.tsx  settings/page.demo.tsx
src/lib/asset-urls.ts         # NEW real seam (identity behaviour for the real build)
src/lib/claude-types.ts       # NEW: VISION_MODELS, isClaudeReady, ClaudeCliStatus moved out of server modules
scripts/demo/                 # developer-run, vitest-hosted (like scripts/spike)
├── build-assets.demo.ts
├── record-discogs.demo.ts
└── verify-export.ts          # node script: checks out/ (CI + local)
vitest.demo.config.ts         # include scripts/demo/**/*.demo.ts, setupFiles: []  (see Pitfall 6)
.github/workflows/demo-pages.yml
```

### Pattern 1: One codebase, two builds, switched by `pageExtensions`

**What:** `next.config.ts` returns a demo config when `NEXT_PUBLIC_DEMO === '1'`. With `pageExtensions: ['demo.tsx', 'demo.ts']`, only `*.demo.tsx` files are routes, layouts and special files. Next's docs say `pageExtensions` also governs `proxy` and `instrumentation` file detection [CITED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:25, 01-app/02-guides/instrumentation.md:44]. So the proxy, instrumentation and all route handlers vanish from the demo build. The real build's default extensions (`tsx`, `ts`, `jsx`, `js`) do not match `page.demo.tsx`, so the real app ignores the demo files.
**Proven:** a scratch build printed `Route (app) ○ / ○ /_not-found ○ /settings ○ /spines ○ /upload`. The middleware manifest had `"middleware": {}` and `server-reference-manifest.json` had `"node": {}`. [VERIFIED: spike build, this session]

```ts
// next.config.ts (shape proven in the spike; keep the existing NEXT_DIST_DIR logic for the real branch)
import type { NextConfig } from 'next';

const isDemo = process.env.NEXT_PUBLIC_DEMO === '1';
const DEMO_BASE = '/discogs-ai-importer';
const cssRule = { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } };

const realConfig: NextConfig = { /* existing: distDir, agentRules, experimental.proxyClientMaxBodySize, turbopack.rules */ };

const demoConfig: NextConfig = {
  output: 'export',
  basePath: DEMO_BASE,            // assetPrefix defaults to basePath (next/dist/server/config.js)
  trailingSlash: true,            // emits upload/index.html etc. (verified)
  pageExtensions: ['demo.tsx', 'demo.ts'],
  agentRules: false,
  env: { NEXT_PUBLIC_BASE_PATH: DEMO_BASE },
  turbopack: {
    rules: cssRule,
    resolveAlias: {
      '@/app/settings/actions': './src/demo/settings-actions.ts', // proven in spike
      '@/lib/asset-urls': './src/demo/asset-urls.ts',
    },
  },
};

export default isDemo ? demoConfig : realConfig;
```

Notes:
- Do **not** set `distDir` in the demo config. With `output: 'export'`, a custom `distDir` only renames the export folder, and the build itself still goes to `.next` [VERIFIED: node_modules/next/dist/export/utils.js:31-34, quoted: `return hasCustomExportOutput(config) ? '.next' : config.distDir;`]. The default export folder `out/` is already gitignored (`/out/` in .gitignore).
- `basePath` auto-fills `assetPrefix` [VERIFIED: node_modules/next/dist/server/config.js, quoted: `if (result.assetPrefix === '') { result.assetPrefix = result.basePath; }`]. Do not set both.
- Turbopack aliases accept the `@/…` specifier (proven: `ModelSelect` imported the aliased actions, and the export had no server references). Only the `browser` condition is supported for conditional aliases [CITED: node_modules/next/dist/docs/.../turbopack.md:392]. Plain unconditional aliases are what this needs.

### Pattern 2: Fetch shim installed by a rendered client component

**What:** `src/demo/demo-root.tsx` is `'use client'` and does `import './fetch-shim'` at the top. `layout.demo.tsx` renders `<DemoRoot>` around `<Providers>`. Module evaluation installs the shim before hydration effects run, so before the first TanStack query, before `StatusIndicator`'s first `tick()` and before any mutation.
**Critical detail (found in the spike):** importing a `'use client'` module **only for side effects from the server layout does nothing**. The module never reaches the client bundle, and the first spike build sent `GET /api/status` and `GET /api/spines` to the static server (404). It must be imported by a client component that the layout actually renders. [VERIFIED: spike, both variants]

```ts
// src/demo/fetch-shim.ts (side-effect module; client only)
import { handle } from './routes';
declare global { interface Window { __demoFetchInstalled?: boolean } }
if (typeof window !== 'undefined' && !window.__demoFetchInstalled) {
  window.__demoFetchInstalled = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), window.location.origin);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? req?.headers);
    // Never read a File/Blob body (CONTEXT: the dropped file is never read beyond its name).
    const body = typeof init?.body === 'string' ? init.body : null;
    const res = await handle({ method, url, headers, body });  // may await a short realistic delay
    return Response.json(res.body, { status: res.status });
  };
}
export {};
```

- Match on `url.pathname` starting with `/api/`. Every call site uses a root-relative `/api/...`, which carries no basePath, so this test is exact.
- An unmatched `/api/*` returns 501 and `console.warn`s. A unit test asserts that no real call site falls through (see Validation).
- Return status codes and bodies exactly as the real handlers do (201 for created, 409 `DuplicateBody`, 202 `{checking:true}`, and so on). Components branch on them.

**The client fetch call sites the shim must cover** [VERIFIED: grep of src/components and src/lib this session]:

| Call site | Method + path |
|---|---|
| status-indicator.tsx:108 | GET `/api/status` (header poll, also on `STATUS_REFRESH_EVENT`) |
| photo-status-list.tsx:16 | GET `/api/photos` |
| lib/upload-queue.ts:76 | POST `/api/photos` (File body, `x-filename` header) |
| rescan-button.tsx:99 | POST `/api/photos/{id}/rescan` |
| spines-view.tsx:69 | GET `/api/spines{?photo,review,status}` |
| spine-field.tsx:51 | PATCH `/api/spines/{id}/fields` |
| reattach-dialog.tsx:38, :170 | GET and POST `/api/spines/{id}/reattach` |
| dismiss-spine-button.tsx:87 | POST `/api/spines/{id}/dismiss` |
| candidate-list.tsx:35 | GET `/api/spines/{id}/candidates` |
| discogs-search-dialog.tsx:421 | POST `/api/spines/{id}/candidates` |
| discogs-matches.tsx:322, discogs-search-dialog.tsx:382 | POST `/api/spines/{id}/search` (`mode: again \| text \| ref`) |
| discogs-search-dialog.tsx:113 | GET `/api/discogs/searches/{id}` |
| add-to-collection-button.tsx:119, confirmed-match.tsx:266 | POST and DELETE `/api/spines/{id}/import`, POST `/api/spines/{id}/retry` |
| already-in-collection.tsx:65 | POST `/api/spines/{id}/import/{link-existing\|another}` |
| spine-action-menu.tsx:105 | POST `/api/spines/{id}/not-on-discogs` (`{flag}`) |
| retry-all-failed-button.tsx:44 | POST `/api/spines/retry-failed` |
| connect-discogs-button.tsx:62 | POST `/api/discogs/connect` → `window.location.assign(authorizeUrl)` |
| paste-code-form.tsx:83 | POST `/api/discogs/finish` |
| test-discogs-button.tsx:52 | POST `/api/discogs/test` |
| disconnect-discogs-button.tsx:57 | POST `/api/discogs/disconnect` |
| collection-folder-field.tsx:96, :126 | POST and GET `/api/discogs/folders` |
| dev-job-trigger.tsx:29 | `/api/dev/jobs` (not rendered in the demo; omit) |

No `XMLHttpRequest`, `EventSource` or `WebSocket` usage exists in `src` [VERIFIED: grep].

**Connect flow in the demo:** have the mock `connect` return `authorizeUrl = '/discogs-ai-importer/settings/?discogs=connected'`. The full navigation reloads the page, the state resets to "Connected as demo-user", and `DiscogsConnectNotice` shows its toast and then `router.replace('/settings')`, which is basePath-aware. This is realistic with zero component changes.

### Pattern 3: Demo store with lazy, time-based transitions

**What:** this is a module-level store (plain TS, no React). It is seeded by deep-cloning the fixtures at module init, so a reload means a fresh seed. A mutation does not use timers. It records `readyAt = now + delay` on the search, import or photo run, and the read model derives the state from `Date.now()`. The app's own polling then animates the transitions. The existing intervals are `ACTIVE_POLL_MS = 1500`, `POLL_RETRY_MS = 3000` and `DISCOGS_POLL_MS = 3000` [VERIFIED: src/lib/photo-status.ts:44,50,117], and `spinesRefetchInterval` polls while `discogsActive` or any photo is active.

- Reuse the pure functions exactly. `reviewStatusOf` comes from `src/lib/review-status.ts:34`. `importPhaseOf`, `canChangeMatchOf`, `canRetryOf` and `importMayBeOnDiscogs` come from `src/lib/import-types.ts:157-225`. `needsReview` comes from `src/lib/spine-review.ts:101`, and `emptyByStatus` from `src/lib/review-status.ts:79`. Mirror `getSpines()` in `src/server/scan/queries.ts:311-381`: the filters, `counts`, `statusById`, `photoProgress` and `discogsActive`.
- The review statuses are [VERIFIED: src/lib/import-types.ts:60-67]: `'pending', 'matched', 'imported', 'not_found', 'not_on_discogs', 'failed'`.
- The import statuses are [VERIFIED: src/lib/import-types.ts:13-19]: `'pending', 'importing', 'imported', 'already_in_collection', 'failed'`.
- The import phases are [VERIFIED: src/lib/import-types.ts:84-89]: `'waiting' | 'importing' | 'already_in_collection' | 'imported' | 'failed'`.
- The search states are [VERIFIED: src/lib/discogs-types.ts:53-59]: `'not_searched' | 'queued' | 'searching' | 'done' | 'no_match' | 'failed'`.
- The photo statuses are [VERIFIED: src/lib/scan-types.ts:8-15]: `'queued', 'preparing', 'calling', 'parsing', 'done', 'error'`.
- `useSyncExternalStore(store.subscribe, store.getSnapshot, () => null)` lets the demo pages render only on the client. They show the existing skeletons while the server snapshot is null, which avoids any hydration mismatch from `Date.now()`-based text (see Pitfall 4).

**Seed plan (Claude's discretion; to be confirmed against the recorded candidates).** These match the read's natural content [VERIFIED: the spine list from the fixture this session]:

| State | Spines (index: read) | Why it is natural |
|---|---|---|
| not_found | 21, 32, 36, 47 (illegible, all fields null) | Empty inputs mean no stages, so `no_match` with 0 candidates |
| imported | several Nine Inch Nails, e.g. 9 "march of the pigs", 13 "fixed", 23 "the downward spiral deluxe edition" | Shows progress |
| matched (already in collection) | e.g. 14 Massive Attack "blue lines", with `existing: {count:1, folderId:1, folderName:'Uncategorized', dateAdded}` | The warning state |
| duplicate across spines | 29 atmosphere "godlovesugly" imported; 31 "Atmosphere / null" has the same release among its candidates | Add on 31 returns 409 `DuplicateBody` |
| not_on_discogs | e.g. 25 "Jay Smith & The Modes of Emotion" or 43 "CHECK THIS OUT TOO!" | Obscure item |
| failed (search) | one spine with `discogs.state:'failed'`, `failure:{kind:'unavailable',reason:null}` | Retry shows `queued → done` |
| failed (import) | one spine with `import.phase:'failed'`, `failure:{kind:'unavailable'}`, `canRetry:true` | Retry import shows `waiting → importing → imported` |
| pending | the rest (search `done` with candidates, no import) | The normal review |

**Upload ("drop any photo"):** `POST /api/photos` reads only `x-filename` and returns `201 {photoId, duplicate:false}`. The new `PhotoDto` runs `queued → preparing → calling → parsing → done` over about 3 s (`spawnedAt` set so the elapsed timer ticks). It then becomes a second section whose spines are a **pristine clone** of the 61 (no seeded imports), with auto-search `queued → done` about 1-2 s later from the same recordings. Confirming a release that the seeded shelf already imported naturally exercises the duplicate warning. (Alternative: answer `duplicate: true` with the sample photo's id. That is simpler but skips the "analyzing" animation the user asked for.)

### Pattern 4: Fixture assets built by the real pipeline

**What:** a Vitest-hosted script (the same host as `scripts/spike/vision.spike.ts`: the `vitest.config.ts` aliases `server-only` to a stub and `@` to `src`). It calls `classifyVisionRun(rec.run)` (`src/server/vision/parse.ts:135`), `normalizeImage(buf, 'heic', { maxEdge: VISION_MAX_EDGE, maxTokens: VISION_MAX_TOKENS })` (`src/server/images/normalize.ts:182`), and the same loop as `cropDetections` (`src/server/jobs/handlers/scan-photo.ts:177-215`): `normalizeBox → padBox → scaleBox(vision → upright) → cropSpine(upright, region, read.text_orientation)`. It writes deterministic ids (`demo-spine-00`…`60`) and committed files.

**Proven numbers** (from the scratch run, with the photo copied to scratch and deleted after) [VERIFIED: spike this session]:

| Asset | Result |
|---|---|
| Fixture `image` | `{"sentW":1449,"sentH":2576,"sentBytes":481377,"sourceW":4536,"sourceH":8064}` [VERIFIED: test/fixtures/vision/spike/cd-spines.claude-opus-5-5.high.json] |
| Vision JPEG | Reproduced 1449x2576, 481377 bytes, quality 80. Byte-identical size to what Claude saw, so the boxes line up |
| Upright master | 4536x8064 |
| Thumb | 90x160 webp, 3964 bytes |
| Crops | 61 crops (all `media_kind: cd`), 3,302,330 bytes total, widest 2367 px, e.g. `00.webp` 2180x220 |
| Metadata | `sharp().metadata()`: no exif, icc or xmp on the vision JPEG or crops. The pipeline goes through raw pixels |
| Run time | About 5 s |

- Assert `[vision.width, vision.height]` equals `[rec.image.sentW, rec.image.sentH]` and fail loudly otherwise.
- Crop URLs in `shelf.json` should be stored relative (`crops/00.webp`). The demo read model prefixes `${NEXT_PUBLIC_BASE_PATH}/demo-assets/`.
- **Covers:** write `covers/<releaseId>.svg`: a coloured tile (hue from the releaseId hash), with artist and title text from the recorded candidate, escaped for XML. GitHub Pages serves `.svg` as `image/svg+xml`, which `<img>` requires for SVG. No Discogs image is fetched or stored.
- Optionally cap crop width (e.g. 1200 px) to cut the 3.3 MB of crops roughly in half. That is a fidelity/size trade-off and needs the owner's choice.

### Pattern 5: Recording Discogs candidates (developer-run, once)

```ts
// scripts/demo/record-discogs.demo.ts — run: node_modules/.bin/vitest run --config vitest.demo.config.ts scripts/demo/record-discogs.demo.ts
// Uses the real cascade exactly as src/server/jobs/handlers/search-spine.ts:166-172 wires it.
import { discogsFetch } from '@/server/discogs/client';
import { searchInputs } from '@/server/discogs/inputs';
import { parseSearchResponse, rankCandidates, runCascade, toCandidateFromSearch } from '@/server/discogs/search';

const api = { search: async (params) => parseSearchResponse(
  (await discogsFetch({ path: '/database/search', query: params, auth: 'oauth' })).json) };
for (const spine of shelf.spines) {
  if (recorded[spine.id]) continue;                       // resumable
  const inputs = searchInputs(fieldValues(spine));        // artist, title, catalog_number, raw_text
  const out = await runCascade(inputs, api);
  // Same call as search-spine.ts:254-259 — rankCandidates(cands: Candidate[], spineCatno: string | null | undefined)
  const cands = rankCandidates(out.results.map((r, i) => toCandidateFromSearch(r, out.stage ?? 'text', i)), inputs.catno);
  recorded[spine.id] = { stage: out.stage, total: out.total,
    candidates: cands.map(({ thumbUrl, masterId, ...text }) => text) };  // text only: drop thumbUrl
  writeJsonAtomic(DISCOGS_FIXTURE, recorded);             // after each spine
}
```

- **Rate limit:** `discogsFetch` waits on the process-wide `DiscogsGate` (about 1 req/s, re-derived from `X-Discogs-Ratelimit*` headers). At most 3 stages for each of 61 spines (catno, artist_title, text) is about 183 requests, roughly 3 to 4 minutes. Sequential is fine.
- **Secrets:** `discogsFetch` reads the stored OAuth token from `secrets.json` (`secretsFile()` defaults to `<cwd>/secrets.json`). The recorder's Vitest config must **not** use `test/setup/isolate-secrets.ts`, which points `SECRETS_FILE` at an empty temp file (see Pitfall 6).
- **Dry run without network:** point `DISCOGS_API_BASE` at `test/fixtures/fake-discogs.mjs`. `apiBase()` honours loopback http overrides [VERIFIED: src/server/discogs/config.ts:32-34].
- **Canned release for "paste a link":** record 1-2 `GET /releases/{id}` results through `toCandidateFromRelease` (`search.ts:255`) for the `mode: 'ref'` path. The demo's `parseDiscogsRef` (`src/lib/discogs-ref.ts`, client-safe) accepts any URL or number, and an unknown id returns a fixed canned release.
- **Manual "Search Discogs" dialog:** the demo searches only the recorded candidates. It case-folds the query against title, labels and catno across all spines' recordings, and returns at most 25 (`DIALOG_RESULTS_MAX = 25` [VERIFIED: src/lib/discogs-types.ts:148]).
- **Privacy:** store no username, token, `thumbUrl` or image URLs. Add a test that the committed `discogs.json` contains no `"thumb"` key and no `https://i.discogs.com`/`img.discogs.com` strings.

### Pattern 6: GitHub Pages deploy

```yaml
# .github/workflows/demo-pages.yml
name: Demo site
on:
  push: { branches: [master] }        # default branch is master (gh repo view), NOT main
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6          # reads packageManager: pnpm@12.14.0 (v11+ required to omit version)
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run src/demo         # demo unit tests only (fast, no native modules)
      - id: pages
        uses: actions/configure-pages@v6
      - run: pnpm demo:build                  # NEXT_PUBLIC_DEMO=1 next build && copy demo/assets → out/demo-assets
      - run: node scripts/demo/verify-export.ts
      - uses: actions/upload-pages-artifact@v5
        with: { path: ./out }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Versions [VERIFIED: GitHub releases API, this session]:

| Action | Version | Released |
|---|---|---|
| actions/checkout | v7.0.1 | 2026-07-20 |
| actions/setup-node | v7.1.0 | 2026-10-08 |
| pnpm/action-setup | v6.1.0 | 2026-09-05 |
| actions/configure-pages | v6.0.0 | 2026-03-25 |
| actions/upload-pages-artifact | v5.0.0 | 2026-04-10 |
| actions/deploy-pages | v5.0.1 | 2026-09-01 |

The structure follows Next's own Pages template [CITED: raw.githubusercontent.com/nextjs/deploy-github-pages/main/.github/workflows/deploy.yml], which uses older pins. Pages permissions are `pages: write` and `id-token: write`, and the default environment is `github-pages` [CITED: docs.github.com/en/pages/.../using-custom-workflows-with-github-pages].

**One-time setup (owner/CLI, not a file):** Pages is currently disabled (`gh api repos/patrickclery/discogs-ai-importer/pages` returns 404) [VERIFIED]. Enable it with Actions as the source:
`gh api -X POST repos/patrickclery/discogs-ai-importer/pages -f build_type=workflow`. `build_type` accepts `legacy` or `workflow` [CITED: docs.github.com/en/rest/pages/pages]. `gh` is logged in with the `repo` and `workflow` scopes [VERIFIED: gh auth status]. This is a `checkpoint:human-action` (or an autonomous `gh` call if the owner OKs it), because it changes repository settings.

- `.nojekyll` is not needed. Artifact deploys are served as uploaded, and `upload-pages-artifact` v4+ drops dotfiles unless `include-hidden-files` is set [CITED: github.com/actions/upload-pages-artifact/releases]. The post-deploy smoke check (fetching a `/_next/static/...` chunk) proves `_next/` is served.
- `404.html` is emitted by the export (verified: `out/404.html`). [ASSUMED] GitHub Pages serves a project site's own `404.html` for unknown paths under `/discogs-ai-importer/`.

### Anti-Patterns to Avoid

- **Env checks inside the real `page.tsx`/`layout.tsx`.** The real pages import `@/server/*` (better-sqlite3, the claude CLI) at the top of the module. Keep them untouched and add `*.demo.tsx` siblings.
- **Importing the shim from the server layout as a bare side-effect import.** It never reaches the client (proven).
- **`setTimeout`-driven state machines in the store.** They leak across unmounts and cause double-advance under React StrictMode. Derive state from `Date.now()` against `readyAt` instead.
- **Reading the dropped `File`** (`await file.arrayBuffer()`), even for a hash. CONTEXT forbids it. Use the `x-filename` header only.
- **Re-hosting Discogs thumbnails, or storing their URLs.**
- **Globbing `fixtures/spike/`** in any demo script. Open `cd-spines.heic` by exact name only (the other files are the mother's photos).
- **Committing `test/fixtures/vision/spike/img-35xx.*` content into demo fixtures** (they are the mother's shelf reads, already in git for tests).
- **Making `src/demo/**` reachable from real code.** Only `*.demo.tsx` and next.config aliases may import it.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Review status, import phase, change-match and retry rules | New demo logic | `reviewStatusOf`, `importPhaseOf`, `canChangeMatchOf`, `canRetryOf`, `importMayBeOnDiscogs`, `needsReview`, `emptyByStatus` from `src/lib` | They are client-safe already and are what the real read model uses. Duplicating them drifts. |
| Crop geometry | Re-implement padding and scaling | `normalizeBox`/`padBox`/`scaleBox`/`cropSpine` | Proven identical output |
| Vision image | Re-encode the HEIC another way | `normalizeImage` | Reproduces the exact 481377-byte image Claude saw |
| Discogs search ranking | New ranking | `runCascade` + `rankCandidates` + `toCandidateFromSearch` | Same candidates the real app would show |
| Release-ref parsing in the dialog | Regex | `parseDiscogsRef` (`src/lib/discogs-ref.ts`) | Same accepted inputs and `MASTER_REFUSAL` copy |
| Duplicate 409 body | Ad-hoc JSON | The `DuplicateBody` type (`src/lib/import-types.ts:140-150`) + `parseDuplicateBody` | The component parses it strictly |
| Static hosting / CDN | gh-pages branch pushes | `upload-pages-artifact` + `deploy-pages` | Official, no branch churn |

**Key insight:** the demo's value is fidelity. Every rule that decides what a card shows already lives in pure `src/lib` functions. The demo store should only hold raw state, the same shape as the DB rows, and call those functions.

## Required changes to real code (behaviour-preserving, minimal)

1. **`src/lib/asset-urls.ts` (new real seam).** The demo build aliases it to `src/demo/asset-urls.ts`. **→ RESOLVED (CONTEXT follow-up): the owner will enable Enforce HTTPS themselves; the demo must work over both http and https.**
   - `candidateThumbSrc(c: { id: string; releaseId: number }): string`. The real version returns `` `/api/discogs/thumb/${encodeURIComponent(c.id)}` ``, which is today's string from candidate-row.tsx:44 [VERIFIED, quoted: ``src={src ?? `/api/discogs/thumb/${encodeURIComponent(candidate.id)}`}``]. `CandidateThumb`'s `Pick` widens to include `releaseId`.
   - `searchThumbSrc(searchId: string, releaseId: number): string`. The real version returns `` `/api/discogs/searches/${encodeURIComponent(searchId)}/thumb/${releaseId}` `` (discogs-search-dialog.tsx:277) [VERIFIED].
   - `isAppFileUrl(url: string): boolean`. The real version is `url.startsWith('/api/files/')`, which replaces duplicate-import-dialog.tsx:33 [VERIFIED, quoted: `return typeof url === 'string' && url.startsWith('/api/files/') ? url : null;`]. The demo version accepts `${BASE}/demo-assets/`.
   - Demo versions return `${BASE}/demo-assets/covers/${releaseId}.svg`.
2. **Move client-needed values out of server modules.** `claude-cli-card.tsx:16-17` imports values from server-only modules [VERIFIED, quoted: `import { type ClaudeCliStatus, isClaudeReady } from '@/server/claude/cli';` and `import { VISION_MODELS } from '@/server/settings';`]. Move `VISION_MODELS`/`VisionModelId`, `isClaudeReady` and the `ClaudeCliStatus`/`ClaudeAuthState`/`TestResult` types to `src/lib/claude-types.ts`, and re-export them from the server modules so no server import changes. Then the card can render inside the client demo settings page. **→ RESOLVED (CONTEXT follow-up): a dropped photo becomes a fresh second copy of the shelf with its own 61 spines.**
3. **Optional:** extract the body of `RootLayout` into a shared `AppShell` so `layout.demo.tsx` does not duplicate the providers tree. Duplication of about 40 lines is also acceptable. **→ RESOLVED (CONTEXT follow-up, D-18): crops are DOWNSCALED for the demo — this supersedes the "recommend full" note above.**

Nothing else in `src/components` needs to change. The settings server actions are swapped by alias. Demo DTOs carry static URLs for `crop.url`, `thumbUrl` and `visionUrl`, which plain `<img>`/`<a>` use as-is (`src/lib/scan-types.ts:82-83, 94`).

Settings action exports the alias target must mirror [VERIFIED: src/app/settings/actions.ts]: `ActionState` (type), `saveDiscogsCredentials(_prev, formData)`, `clearSecretAction(key)`, `saveVisionModel(id)`, `saveCollectionFolder(id)`, `testClaudeAction()`.

## Common Pitfalls

### Pitfall 1: A local demo build destroys the real production build in `.next`
**What goes wrong:** `NEXT_PUBLIC_DEMO=1 next build` always builds into `.next` and wipes it. Only `.next/dev` survives (the running dev server is safe). The real `next start` build and `.next/verify` (used by the repo's verify scripts via `NEXT_DIST_DIR`) are deleted [VERIFIED: spike; `.next/dev/marker` survived, `.next/verify/marker` and a root marker did not].
**How to avoid:** run demo builds in CI. Locally, either accept it (`pnpm start` rebuilds anyway) or build in a git worktree. The README and the `demo:build` script must warn about this. Never run the demo build while the owner relies on `pnpm serve`.

### Pitfall 2: The demo URL ends on plain HTTP under a custom domain
**What goes wrong:** the user site has `cname: patrickclery.com` and `https_enforced: false` [VERIFIED: gh api repos/patrickclery/patrickclery.github.io/pages]. `curl -sI https://patrickclery.github.io/discogs-ai-importer/` returns `301 location: http://patrickclery.com/discogs-ai-importer/` [VERIFIED]. Secure-context APIs are unavailable there: service workers, and `navigator.clipboard` (used by `callback-url-field.tsx:24`).
**How to avoid:** the fetch shim works in insecure contexts. Recommend that the owner turn on "Enforce HTTPS" for the user-site repo (HTTPS already answers 200 on patrickclery.com [VERIFIED]). This is an owner decision because it affects their main site. basePath stays `/discogs-ai-importer` either way.

### Pitfall 3: The shim is not in the client bundle
**What goes wrong:** `import '@/demo/fetch-shim'` inside `layout.demo.tsx` (a server component) silently does nothing, and requests hit the static host and 404 [VERIFIED: spike run 1].
**How to avoid:** import it inside a `'use client'` component that the layout renders (`DemoRoot`).

### Pitfall 4: Hydration mismatch from time-based text
**What goes wrong:** `confirmed-match.tsx:133` calls `importStateLine(dto, Date.now())` during render, and `photo-section` shows "scanned N minutes ago". Prerender happens at CI build time, so any data rendered into static HTML differs on the client.
**How to avoid:** the demo pages render data only after mount (`useSyncExternalStore` with a `null` server snapshot, and the existing `loading.tsx` skeleton markup as the fallback). Seed timestamps relative to the store's init time (`initAt - 7 min`), not absolute dates.

### Pitfall 5: `useSearchParams`/nuqs without Suspense in a prerendered page
**What goes wrong:** `SpinesView`'s nuqs hooks and `DiscogsConnectNotice` read search params. In a prerendered route, the tree up to the nearest Suspense renders client-side, and Next asks for a boundary [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:82-88].
**How to avoid:** wrap the demo spines page body and the settings notice in `<Suspense>` (the spike did, and the build passed). The demo spines page reads `photo`/`review`/`status` from `useSearchParams()` and passes them as `initialPhoto`/`initialReview`/`initialStatus`, with `parseStatusParam` from `src/lib/review-status.ts:62`.

### Pitfall 6: The Vitest setup file hides the owner's sign-in from the recorder
**What goes wrong:** `vitest.config.ts` runs `test/setup/isolate-secrets.ts`, which sets `SECRETS_FILE` to an empty temp file, so `discogsFetch(..., auth:'oauth')` sees no token.
**How to avoid:** `vitest.demo.config.ts` spreads the base config but sets `setupFiles: []` and includes only `scripts/demo/**/*.demo.ts` (proven for the asset script). Never add these scripts to `pnpm test`.

### Pitfall 7: Relative asset URLs vs basePath
**What goes wrong:** `next/link`, `router.push/replace` and `router.refresh()` get basePath automatically [CITED: basePath.md:20-24], but plain `<img src>`/`<a href>` do not. A DTO URL like `/demo-assets/x.webp` resolves to `patrickclery.com/demo-assets/...`.
**How to avoid:** the demo read model builds every asset URL with `process.env.NEXT_PUBLIC_BASE_PATH`, which is set by the demo config's `env`. A verify step greps `out/**/*.html` for `src="/` and `href="/` not followed by `discogs-ai-importer`.

### Pitfall 8: Polling never stops, or never starts
**What goes wrong:** `spinesRefetchInterval` polls every 1.5 s while any photo status is active and every 3 s while `discogsActive`. If the store leaves a search `queued` forever, the page polls forever. If a mutation does not set `discogsActive`, the UI never refreshes the transition.
**How to avoid:** every pending state in the store has a `readyAt`. `discogsActive` is true exactly while a search is queued or searching, or an import is waiting or importing (mirror `queries.ts:350-379`). Add a unit test that advances a fake clock past all `readyAt`s and asserts `discogsActive === false`. The header `StatusIndicator` polls `/api/status` on its own timer; keep that handler cheap.

### Pitfall 9: Publishing the wrong family photos
**What goes wrong:** `fixtures/spike/` holds `IMG_3554…3562.heic` (the mother's shelves), and `test/fixtures/vision/spike/img-35xx.*.json` are their reads, already committed for tests.
**How to avoid:** the asset script opens only `fixtures/spike/cd-spines.heic` by exact path. `verify-export` fails if `out/` contains `IMG_35`, `img-35` or `.heic`, or any file not in an allowlist of `demo-assets` names. Add a unit test that `demo/fixtures/*.json` contains no `img-35`.

### Pitfall 10: Pages environment branch rule and default branch
**What goes wrong:** Next's template triggers on `main`, but this repo's default branch is `master` [VERIFIED: gh repo view]. The `github-pages` environment created by enabling Pages usually limits deployments to the default branch [ASSUMED].
**How to avoid:** trigger on `master` and deploy only from `master`.

### Pitfall 11: The demo `next dev` collides with the owner's dev server
**What goes wrong:** both would use `.next/dev` in the same folder, and 3001 is reserved.
**How to avoid:** do not run the demo in `next dev` next to the real dev server. Preview the static export with a tiny static server on another port (4173) that mounts `out/` at `/discogs-ai-importer/` [ASSUMED for concurrency behaviour; the static preview is proven].

## Code Examples

### Demo layout (proven shape)

```tsx
// src/app/layout.demo.tsx: same tree as layout.tsx plus DemoRoot + banner (spike-proven)
import { DemoRoot } from '@/demo/demo-root';
// …same font, ThemeProvider, TooltipProvider, Toaster as layout.tsx…
<ThemeProvider>
  <TooltipProvider>
    <DemoRoot>               {/* 'use client'; imports ./fetch-shim; renders the banner first */}
      <Providers>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </Providers>
    </DemoRoot>
    <Toaster position="bottom-right" richColors={false} />
  </TooltipProvider>
</ThemeProvider>
```

### Root page (proven)

`redirect('/upload')` in `page.demo.tsx` exports as an empty body with `NEXT_REDIRECT;replace;/upload;307;` in the RSC payload. Headless Chrome followed it client-side to the Upload page, with basePath applied [VERIFIED: spike]. It shows nothing without JS. For a no-JS fallback, also render `<meta httpEquiv="refresh" content="0; url=/discogs-ai-importer/upload/" />` and a link.

### Demo spines page

```tsx
'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SpinesView } from '@/components/spines-view';
import { parseStatusParam } from '@/lib/review-status';
import { useDemoSpines } from '@/demo/store';   // useSyncExternalStore; null on the server

function Inner() {
  const sp = useSearchParams();
  const photo = sp.get('photo') || null;
  const review = sp.get('review') === '1';
  const status = parseStatusParam(sp.get('status')) ?? null;
  const initialData = useDemoSpines({ photo, review, status });
  if (!initialData) return <SpinesSkeleton />;   // reuse spines/loading.tsx markup
  return <SpinesView initialData={initialData} initialPhoto={photo} initialReview={review} initialStatus={status} />;
}
export default function SpinesPage() { return <Suspense fallback={<SpinesSkeleton />}><Inner /></Suspense>; }
```

### Static preview server for local smoke checks (no dependency)

This is a ~30-line `node:http` server that maps `/discogs-ai-importer/*` to `out/*` (directory → `index.html`), logs each request path, and listens on 127.0.0.1:4173. The smoke test asserts that no logged path starts with `/api/`. (The spike used `python3 -m http.server` over a symlinked `site/discogs-ai-importer → out`.)

## State of the Art

| Old approach | Current approach | When changed | Impact |
|---|---|---|---|
| `next export` CLI | `output: 'export'` in config | Next 14 | `next build` does both |
| `distDir` = build folder in export mode | A custom `distDir` names the export folder; the build stays in `.next` | Current (16.4.2 source) | Pitfall 1 |
| `middleware.ts` | `proxy.ts` (not supported in export) | Next 16 | Excluded by `pageExtensions` |
| upload-pages-artifact includes dotfiles | v4+ excludes them; v5 adds `include-hidden-files` | 2025-2026 | `.nojekyll` not needed |
| pnpm/action-setup `version:` required | Omit when `packageManager` declares pnpm ≥11 | v5/v6 README | Reads `pnpm@12.14.0` |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | GitHub Pages serves the project's own `out/404.html` for unknown paths under `/discogs-ai-importer/` | Pattern 6 | Low: a default GitHub 404 page instead |
| A2 | The `github-pages` environment limits deploys to the default branch | Pitfall 10 | Low: the deploy is rejected on another branch; trigger on master anyway |
| A3 | Artifact-based Pages deploys run no Jekyll, so `_next/` is served | Pattern 6 | Medium: chunks 404. The post-deploy smoke curl detects it, and the fix is `include-hidden-files: true` + `.nojekyll` |
| A4 | A demo `next dev` alongside the owner's dev server would conflict on `.next/dev` | Pitfall 11 | Low: use the static preview instead |
| A5 | `ubuntu-latest` runners have network access for `next/font/google` at build time | Pattern 6 | Low: the build fails visibly |
| A6 | The seed plan's duplicate pair (spine 29/31) works out from the real recordings | Pattern 3 | Low: pick another pair after recording |
| A7 | The owner is OK with publishing 3.3 MB of full-resolution crops (or prefers downscaled ones) | Pattern 4 | Low: a size/fidelity choice |
| A8 | The owner will enable Pages (or let the agent run the `gh api` POST) and decide on Enforce HTTPS for patrickclery.com | Pattern 6, Pitfall 2 | Medium: no site until Pages is enabled |

## Open Questions (RESOLVED)

1. **Enforce HTTPS on patrickclery.com?** Today the demo lands on `http://`. Recommendation: the owner toggles it on the user-site repo (outside this repo's scope). The demo works either way with the fetch shim.
2. **What does a dropped photo become?** A second, pristine copy of the shelf (recommended: it shows scan → search → import end to end and naturally triggers the duplicate warning), or a `duplicate: true` response pointing at the sample? This needs the owner's nod, or the planner picks the recommended option.
3. **Crop resolution:** full master crops (3.3 MB) or downscaled? Recommend full. It is what the real app shows.
4. **Does the README link to the demo?** Suggested: a one-line link. Also, the README launch text still says port 3000 (stale; out of scope but cheap to fix). **→ RESOLVED: yes, the README gets a one-line demo link (plan 05-06).**

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node | Builds, scripts | ✓ | v24.22.0 | — |
| pnpm | Scripts | ✗ on PATH | corepack available (`corepack pnpm`), `packageManager: pnpm@12.14.0` | `node_modules/.bin/*` |
| `fixtures/spike/cd-spines.heic` | Asset generation (owner machine only) | ✓ | — | None. The asset script must fail clearly in CI and is never run there |
| `secrets.json` with a Discogs sign-in | Recording script | ✓ (keys `discogsConsumerKey`, `discogsConsumerSecret`, … present; values not read) | — | `DISCOGS_API_BASE` + fake-discogs for a dry run |
| sharp / heic-decode | Asset generation | ✓ (proven run) | 0.35.5 / 2.1.0 | — |
| google-chrome-stable | Optional local headless smoke | ✓ `/usr/bin/google-chrome-stable` | — | Manual browser UAT |
| python3 | Optional static preview | ✓ | — | The node:http preview script |
| gh CLI (`repo`, `workflow` scopes) | Enabling Pages | ✓ logged in as patrickclery | — | GitHub web UI: Settings → Pages → Source: GitHub Actions |
| GitHub Pages on the repo | Hosting | ✗ not enabled (404) | — | Enable once (Pattern 6) |

**Missing dependencies with no fallback:** none. GitHub Pages must be enabled once (an owner/CLI step).

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 5.0.5 (`vitest.config.ts`, `include: ['src/**/*.test.ts']`, node env, forks pool) |
| Config file | `vitest.config.ts` (existing). Add `vitest.demo.config.ts` for the developer-run asset/record scripts only |
| Quick run command | `node_modules/.bin/vitest run src/demo` |
| Full suite command | `node_modules/.bin/vitest run && node_modules/.bin/biome check && NEXT_PUBLIC_DEMO=1 node_modules/.bin/next build && node scripts/demo/verify-export.ts` |

### Phase Requirements → Test Map

| Req | Behaviour | Test type | Automated command | File exists? |
|---|---|---|---|---|
| DEMO-01 | The demo config is exported only under `NEXT_PUBLIC_DEMO=1`; the real config is unchanged | unit | `vitest run src/demo/next-config.test.ts` (import next.config with and without the env, assert `output`, `basePath`, `pageExtensions`) | ❌ Wave 0 |
| DEMO-01/02 | The export builds; out/ has `index.html`, `upload/index.html`, `spines/index.html`, `settings/index.html` and `404.html`; there is no `out/api`; `.next/server/server-reference-manifest.json` has empty `node`/`edge`; `middleware-manifest.json` middleware is `{}`; no chunk contains `better-sqlite3`, `node:fs`, `child_process`, `drizzle-orm`, `heic-decode` or `createServerReference)("<hex>`; every root-relative `src`/`href` in HTML starts with `/discogs-ai-importer/` | build + script | `NEXT_PUBLIC_DEMO=1 next build && node scripts/demo/verify-export.ts` | ❌ Wave 0 |
| DEMO-02 | No `*.demo.tsx` or `src/demo/**` file imports `@/server` or `@/app/settings/actions`; no real (non-demo) file imports `@/demo` | unit (grep) | `vitest run src/demo/boundaries.test.ts` | ❌ Wave 0 |
| DEMO-03 | **Mock coverage:** every real route file's exported methods (enumerated from `src/app/api/**/route.ts`, excluding `dev/jobs`, `discogs/callback`, `files/[...path]`, `discogs/thumb`, `searches/[id]/thumb`) has a demo route; every `fetch('/api/...')` literal in `src/components`/`src/lib` matches a demo route | unit | `vitest run src/demo/routes-coverage.test.ts` | ❌ Wave 0 |
| DEMO-03 | The read model matches the real rules: counts sum to `all`, `statusById` covers listed spines, filters behave like `getSpines` | unit | `vitest run src/demo/read-model.test.ts` | ❌ Wave 0 |
| DEMO-08 | Transitions with a fake clock: upload `queued → done` in ~3 s; search again `queued → done`; import `waiting → importing → imported`; retry failed; retry-all; not on Discogs toggles; link existing / another; change match (DELETE import → 200 `{cancelled:true}`); duplicate Add → 409 `DuplicateBody`; `discogsActive` false once all `readyAt` pass | unit | `vitest run src/demo/store.test.ts` | ❌ Wave 0 |
| DEMO-03 | Reset on reload: two fresh store instances from the seed are deep-equal after mutating one | unit | in `store.test.ts` | ❌ Wave 0 |
| DEMO-04/06 | Fixtures: `shelf.json` has 61 spines with crop dims matching the files; every crop/cover/vision file referenced exists in `demo/assets`; no `img-35`/`IMG_35`/`.heic` strings; `discogs.json` has no `thumb`/image URLs or username | unit | `vitest run src/demo/fixtures.test.ts` | ❌ Wave 0 |
| DEMO-07 | The seed yields ≥1 spine in each of the 6 review statuses, ≥1 `already_in_collection`, ≥1 failed search, ≥1 failed import, and a duplicate pair | unit | in `read-model.test.ts` | ❌ Wave 0 |
| DEMO-03 | **No network to /api in a real browser:** serve out/ at `/discogs-ai-importer/` on 4173, load each page in headless Chrome, assert the server log has zero `/api` requests and the pages render (proven technique) | smoke (local, optional in CI) | `node scripts/demo/smoke.ts` (spawns the preview + `google-chrome-stable --headless=new --dump-dom`) | ❌ Wave 0 |
| DEMO-09/10 | The banner is visible; the deployed URL serves the pages; clicking through works | manual UAT (plain do/see steps) | after deploy: `curl -sI` the page and one `_next/static` chunk | n/a |

### Sampling Rate
- **Per task commit:** `node_modules/.bin/vitest run src/demo` (seconds).
- **Per wave merge:** the full `vitest run`, `biome check` and the demo build + `verify-export` (the build takes about 8 s on this machine, proven).
- **Phase gate:** all of the above plus the local headless smoke and a real deploy check before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/demo/routes-coverage.test.ts`: the route-file and call-site enumeration (the strongest guard that the mock covers every endpoint)
- [ ] `src/demo/boundaries.test.ts`: import-boundary grep
- [ ] `scripts/demo/verify-export.ts`: output and manifest checks
- [ ] `scripts/demo/smoke.ts` + the static preview server (optional in CI; Chrome is preinstalled on GitHub's ubuntu runners [ASSUMED])
- [ ] `vitest.demo.config.ts` with `setupFiles: []`
- [ ] package.json scripts: `demo:build`, `demo:preview`, `demo:assets`, `demo:record`

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS category | Applies | Standard control |
|---|---|---|
| V2 Authentication | no | No auth in the demo. The connect flow is simulated, and no tokens exist in the bundle |
| V3 Session Management | no | No sessions or cookies |
| V4 Access Control | no | Static, public, read-only |
| V5 Input Validation | yes (minor) | Demo routes reuse the same strict shapes (`z.strictObject` bodies as in the real routes, or the same field normalizers `normalizeFieldInput`). Discogs/fixture strings render as React text (no `dangerouslySetInnerHTML`). The SVG cover generator must XML-escape artist and title |
| V6 Cryptography | no | — |
| V8 Data Protection | yes | No secrets, usernames, tokens or Discogs image URLs in fixtures or `out/`. No EXIF/GPS in published images (verified stripped). The mother's photos are never published |
| V14 Configuration | yes | Workflow permissions limited to `contents: read, pages: write, id-token: write`. Actions pinned to major versions (optionally SHA-pin). No repository secrets are used by the workflow |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Secret leakage into a public bundle (`secrets.json`, OAuth token, username) | Information disclosure | `pageExtensions` excludes all server code. `verify-export` greps `out/` for `oauth_token`, `discogsConsumer`, the owner's Discogs username (passed via env at verify time, never committed) and `secrets.json` content markers. The fixtures test asserts no token-like keys |
| Publishing private family photos | Information disclosure | Exact-path asset script, an `out/` allowlist, and a no-`IMG_35` check |
| Image metadata (GPS) leakage | Information disclosure | The pipeline re-encodes from raw pixels; verified that no exif/xmp/icc is present |
| SVG cover injection (a crafted title in an SVG) | Tampering/XSS | XML-escape the text. Covers load via `<img>` (scripts never run in img-loaded SVG) |
| Supply-chain risk in the workflow | Tampering | Official `actions/*` and `pnpm/action-setup` only; `--frozen-lockfile`; least-privilege permissions |
| A real build accidentally shipping demo code | Tampering | `boundaries.test.ts`: real modules never import `@/demo`. Aliases exist only in the demo config branch |

## Sources

### Primary (HIGH confidence)
- **Spike build of this repo (scratch copy, this session):** a demo config with `pageExtensions` demo.* + `resolveAlias`. Results: 5 static routes, empty server-reference and middleware manifests, export layout (`trailingSlash` → `*/index.html`, `404.html`, `favicon.ico` under basePath), `.next` wipe behaviour, a headless Chrome run under basePath with zero `/api` server hits, and a client-side root redirect.
- **Real pipeline run on `cd-spines.heic` (scratch, this session):** dims, bytes, crop count and sizes, metadata stripped.
- Next 16.4.2 bundled docs: `static-exports.md` (supported and unsupported features), `pageExtensions.md`, `proxy.md:25`, `instrumentation.md:44`, `basePath.md`, `turbopack.md` (resolveAlias), `use-search-params.md`.
- Next source: `node_modules/next/dist/export/utils.js:23-34`, `node_modules/next/dist/server/config.js` (basePath → assetPrefix).
- Codebase: the src/lib DTO and status modules, src/components fetch sites, src/app pages, actions, routes and the scan-photo handler, as cited inline.
- GitHub API (this session): latest releases of the six actions, repo visibility/default branch, Pages status of this repo and the user site, and HTTP redirect behaviour.
- npm registry: msw 3.0.3 (evaluated, rejected).

### Secondary (MEDIUM confidence)
- nextjs/deploy-github-pages template (workflow and next.config shape).
- GitHub Docs: custom workflows for Pages, publishing source, the REST Pages API (`build_type`).
- actions/upload-pages-artifact release notes (dotfile exclusion in v4, `include-hidden-files` in v5).

### Tertiary (LOW confidence)
- Assumptions A1-A5 above.

## Metadata

**Confidence breakdown:**
- Build switch and export constraints: HIGH. Proven with a real build plus a browser run.
- Mock layer: HIGH. The shim was proven, the call sites were enumerated, and MSW was ruled out by verified HTTP behaviour.
- Fixtures/assets: HIGH. The real pipeline was run and the outputs measured.
- Discogs recording: MEDIUM-HIGH. The code paths were read but not executed (no live Discogs calls were allowed).
- Deploy: MEDIUM-HIGH. Action versions verified; Pages behaviour partly assumed (A1-A3).
- Pitfalls: HIGH for the 1, 2, 3, 6 and 9 (verified); MEDIUM for the rest.

**Research date:** 2026-10-23
**Valid until:** 2026-11-22 (30 days; re-check the action majors and Next patch at kickoff)
