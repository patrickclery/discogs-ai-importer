---
phase: 05-stubbed-demo-site
reviewed: 2026-10-23T18:47:54Z
depth: deep
files_reviewed: 52
files_reviewed_list:
  - .github/workflows/demo-pages.yml
  - README.md
  - biome.json
  - next.config.ts
  - package.json
  - vitest.demo.config.ts
  - demo/fixtures/discogs.json
  - demo/fixtures/shelf.json
  - scripts/demo/build-assets.demo.ts
  - scripts/demo/build-covers.demo.ts
  - scripts/demo/build-demo.ts
  - scripts/demo/record-discogs.demo.ts
  - scripts/demo/smoke.ts
  - scripts/demo/verify-export.ts
  - src/app/error.demo.tsx
  - src/app/layout.demo.tsx
  - src/app/page.demo.tsx
  - src/app/settings/page.demo.tsx
  - src/app/spines/page.demo.tsx
  - src/app/upload/page.demo.tsx
  - src/components/candidate-row.tsx
  - src/components/claude-cli-card.tsx
  - src/components/discogs-search-dialog.tsx
  - src/components/duplicate-import-dialog.tsx
  - src/components/test-claude-button.tsx
  - src/demo/asset-urls.ts
  - src/demo/cover-svg.ts
  - src/demo/demo-root.tsx
  - src/demo/fetch-shim.ts
  - src/demo/hooks.ts
  - src/demo/ops/account.ts
  - src/demo/ops/imports.ts
  - src/demo/ops/review.ts
  - src/demo/ops/uploads.ts
  - src/demo/read-model.ts
  - src/demo/routes.ts
  - src/demo/routes/account.ts
  - src/demo/routes/http.ts
  - src/demo/routes/imports.ts
  - src/demo/routes/read.ts
  - src/demo/routes/review.ts
  - src/demo/routes/uploads.ts
  - src/demo/seed.ts
  - src/demo/settings-actions.ts
  - src/demo/store.ts
  - src/demo/next-config.test.ts
  - src/demo/routes-coverage.test.ts
  - src/demo/boundaries.test.ts
  - src/lib/asset-urls.ts
  - src/lib/claude-types.ts
  - src/server/claude/cli.ts
  - src/server/settings.ts
findings:
  critical: 0
  warning: 6
  info: 6
  total: 12
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-10-23T18:47:54Z
**Depth:** deep
**Files Reviewed:** 52 (diff 8233646..HEAD, excluding .planning/ and binary demo/assets; the images were checked for metadata only)
**Status:** issues_found

## Summary

All four focus areas hold up, and no blocker was found.

1. **The real build is unaffected.** `next.config.ts` returns the untouched real config unless `NEXT_PUBLIC_DEMO` is exactly `'1'`, and `next-config.test.ts` pins this. No non-demo file imports `@/demo/*`. `*.demo.tsx` files are not route files under the default pageExtensions. The real code changes are limited to moving client-safe types into `src/lib/claude-types.ts` (the server files re-export them) and adding the `src/lib/asset-urls.ts` seam, which returns the same strings as before. `tsc --noEmit` is clean, biome is clean, and `vitest run src/demo` passes (147 tests).
2. **The demo bundle has no server code or secrets.** Every `@/server` and `@/app/api` import reachable from demo pages is `import type`. The latest scratch export (`/tmp/discogs-demo-build/out-679267-…`) has no `node:`/`server-only`/DB strings and no absolute home paths. Its `server-reference-manifest.json` is empty. `vision.jpg` and `thumb.webp` have no EXIF, XMP or IPTC data. The fixtures hold no URL, token, username or thumb keys.
3. **The fetch shim matches the real API shapes closely.** Statuses, error codes and messages match the real routes checked (rescan, fields, spines, connect, test, folders, settings actions). The gaps are edge-case robustness (WR-01, IN-04).
4. **The workflow is safe.** It runs only on push to master and workflow_dispatch, never on pull_request, so untrusted PR code cannot run with `pages: write`. The deploy is gated to master, and no secrets are referenced. Least-privilege and pinning can be tightened (WR-02).

## Warnings

### WR-01: A handler exception in the fetch shim becomes a rejected fetch ("couldn't reach the app") instead of a 500

**File:** `src/demo/fetch-shim.ts:46-48`, `src/demo/routes.ts:118-125`
**Issue:** `handle()` calls `hit.route.handler(...)` synchronously without a try/catch, and the shim awaits it without a try/catch. If an op throws (for example on a malformed seed entry or an unexpected `undefined` in `structuredClone`), the `window.fetch` promise rejects. Every client treats a rejected fetch as a network failure ("Couldn't reach /api/status…", `UNREACHABLE`). The real app instead returns a 500 JSON body. A handler that throws midway can also leave state half-mutated with no `emit()`, so the UI never re-renders the partial change.
**Fix:**
```ts
// routes.ts handle()
let res: DemoResponse;
try {
  res = hit.route.handler({ ... });
} catch (err) {
  console.error(`[demo] ${method} ${path} threw`, err);
  emit(); // surface any partial mutation
  return { status: 500, body: { error: 'demo_error', message: 'The demo hit an error. Reload to reset it.' } };
}
```

### WR-02: Workflow grants `pages: write` and `id-token: write` to the build job, and actions are tag-pinned

**File:** `.github/workflows/demo-pages.yml:11-14, 24-55`
**Issue:** The permissions are set at workflow level, so the `build` job gets the OIDC token request credentials and `pages: write`. That job runs `pnpm install` (third-party lifecycle scripts), `next build`, and headless Chrome against the build output. A compromised dependency could mint an OIDC token and publish to the Pages site. All actions are pinned to mutable major tags (`@v7`, `@v6`, `@v5`) rather than commit SHAs. `actions/checkout` also persists the `GITHUB_TOKEN` into `.git/config`, where install scripts can read it.
**Fix:**
```yaml
permissions:
  contents: read
jobs:
  build:
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@<sha> # v7
        with: { persist-credentials: false }
      ...
  deploy:
    permissions: { pages: write, id-token: write }
```
Pin each third-party action to a full commit SHA, with the tag in a comment.

### WR-03: The verify-export secret scan is a no-op in CI and misses env or relocated secrets locally

**File:** `scripts/demo/verify-export.ts:164-174`, `scripts/demo/build-demo.ts:162-170`
**Issue:**
- Rule h only scans string values of `REPO/secrets.json`. In CI that file never exists, so the only build that is actually published is never checked against real values. The workflow comment "no secret values" overstates this.
- Locally, `build-demo.ts` hard-codes `path.join(REPO, 'secrets.json')` and ignores `SECRETS_FILE`, which `src/server/secrets.ts:52-56` honors. It also never checks `DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET` env values, and `runBuild` passes the full `process.env` into `next build`.
- `SECRET_MIN_LENGTH = 6` skips a short stored Discogs username, while the recorder uses 4.

**Fix:** Resolve the secrets path the same way as `secretsFile()` (`process.env.SECRETS_FILE || 'secrets.json'`). Also add the env values of `SECRET_ENV_NAMES` to `secretValues`. Align the min length with the recorder (4). Strip `DISCOGS_*` and `ANTHROPIC_*` from the env passed to `next build`. Reword the workflow comment, or add a CI-side scan for known secret patterns.

### WR-04: The server-action check can pass silently

**File:** `scripts/demo/verify-export.ts:15, 139-151, 188-190`
**Issue:** Rule c only runs if `server-reference-manifest.json` exists, and a missing file passes silently. In contrast, a missing middleware manifest fails. The bundle fallback `SERVER_ACTION_RE = /createServerReference\)\("[0-9a-f]{20,}/` matches one specific minifier output shape. If the Turbopack output format changes, both guards can pass while a real server action, for example from a relative import that bypasses the `@/app/settings/actions` alias, ships in the export. `FORBIDDEN_STRINGS` also lacks `server-only` and `node:` specifiers.
**Fix:** Treat a missing or unreadable server-reference manifest as a failure, the same as the middleware manifest. Loosen the regex to `/createServerReference\b/`, and add `'server-only'`, `'node:fs'` and `'node:child_process'` to `FORBIDDEN_STRINGS`.

### WR-05: The "never build the demo in the checkout" rule is enforced only by the wrapper script

**File:** `next.config.ts:41-59`
**Issue:** The demo config drops `distDir`. Any `NEXT_PUBLIC_DEMO=1 next build`, or a stray `NEXT_PUBLIC_DEMO=1` in a `.env*` file (Next loads `.env*` before evaluating `next.config.ts`), overwrites the owner's real `.next` in the main checkout and writes `out/`. The only guard is `buildInPlace()` in `build-demo.ts`. Running `next build` directly, or `pnpm build` with that env set, bypasses it. The project treats this as a hard rule (README, CLAUDE notes).
**Fix:** Guard at config time. For example, have `build-demo.ts` set `DEMO_BUILD_SCRATCH=1` when building in the scratch copy, and in `next.config.ts`:
```ts
if (process.env.NEXT_PUBLIC_DEMO === '1' && process.env.CI !== 'true' && process.env.DEMO_BUILD_SCRATCH !== '1') {
  throw new Error('Demo builds run only via scripts/demo/build-demo.ts (scratch copy) or in CI.');
}
```

### WR-06: `DEMO_SCRATCH_DIR` drives recursive deletes with no ownership marker

**File:** `scripts/demo/build-demo.ts:20-25, 73-78, 152-161`
**Issue:** `syncCopy` runs `rmSync(..., { recursive: true, force: true })` on every entry of `<scratch>/repo` except `node_modules`. `pruneOuts` deletes every `out-*` entry in `<scratch>`. The only check is that the scratch dir is not inside the repo. If `DEMO_SCRATCH_DIR` points at a broad existing directory (`$HOME`, a projects folder that already contains a `repo/`, or an ancestor of the checkout), unrelated data is deleted.
**Fix:** Before any delete, require a marker file, for example `<scratch>/.discogs-demo-scratch` written on first creation. Refuse to proceed if the directory is non-empty and lacks the marker. Also refuse when `isInside(REPO, scratch)` is true, not only the reverse.

## Info

### IN-01: The recorder writes discogs.json before running its leak check

**File:** `scripts/demo/record-discogs.demo.ts:207-208, 225-233`
**Issue:** `writeAtomic` runs after every spine, but `leakCheck` runs only at the end. An interrupted run leaves an unchecked `discogs.json` on disk that could be committed. `leakCheck` also ignores env-provided secrets. It reads secrets through `updateSecretsFile(() => null)`, a write API used as a read. `readFileMap`/`readSecretsFileKey` would be clearer.
**Fix:** Run `leakCheck` on the serialized text before each `writeAtomic`. Include `SECRET_ENV_NAMES` env values in the check.

### IN-02: Invisible bidi-control characters are embedded literally in a regex

**File:** `src/demo/ops/uploads.ts:27`
**Issue:** `CONTROL_CHARS` contains raw U+202A–U+202E and U+2066–U+2069. They are invisible in editors and diffs, which is a Trojan-Source-style readability hazard.
**Fix:** use escapes instead of raw characters: `/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu`.

### IN-03: Demo credential save disconnects only when the masked tail changes

**File:** `src/demo/settings-actions.ts:84-93`
**Issue:** The real action disconnects on any change to the effective value. The demo compares only `mask()` tails, so a new key with the same last 4 characters, or any value of 8 characters or fewer (always `'••••'`), keeps the demo connected. This is a minor fidelity gap.
**Fix:** Keep an in-memory hash (not the value) of the last saved value per key and compare against it, or always disconnect on save.

### IN-04: The fetch shim ignores non-string bodies, `Request` bodies and `AbortSignal`

**File:** `src/demo/fetch-shim.ts:33-34, 43-49`
**Issue:** `FormData`, `URLSearchParams` and `Request` bodies become `null`, which gives a 400 "not JSON" from strict routes. `init.signal` is ignored, so an aborted mutation still applies. No current caller hits these cases, but a future caller would fail confusingly only in the demo.
**Fix:** Accept `URLSearchParams` and a `Request` body via `await req.text()` when it is not a Blob. Reject with an `AbortError` when `init.signal?.aborted` before dispatch.

### IN-05: Local demo builds include untracked, unignored files

**File:** `scripts/demo/build-demo.ts:80-87`
**Issue:** `git ls-files -co --exclude-standard` also copies untracked working-tree files, for example uncommitted `demo/assets` or `public/` additions, so a local export can differ from what CI publishes. A local export can then pass checks that CI would fail, or the reverse.
**Fix:** Use `git ls-files -z` (tracked only), or print a warning listing the untracked files that were included.

### IN-06: The workflow runs a full build and deploy on every master push, including planning-only commits

**File:** `.github/workflows/demo-pages.yml:6-9`
**Issue:** Commits that touch only `.planning/**` or docs trigger a full rebuild and redeploy.
**Fix:** Add `paths-ignore: ['.planning/**', '**/*.md']` (README excepted if desired).

---

_Reviewed: 2026-10-23T18:47:54Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
