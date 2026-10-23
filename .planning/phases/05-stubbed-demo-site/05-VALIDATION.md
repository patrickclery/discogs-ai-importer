---
phase: "5"
slug: "stubbed-demo-site"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit, node env) + Node scripts (scratch-copy demo build, export checks, headless Chrome smoke) |
| **Config file** | `vitest.config.ts` (existing; `src/**/*.test.ts`); `vitest.demo.config.ts` (new in 05-02, developer-run fixture scripts only, never part of `pnpm test`) |
| **Quick run command** | `node_modules/.bin/vitest run src/demo` |
| **Full suite command** | `node_modules/.bin/vitest run && node_modules/.bin/tsc --noEmit && node_modules/.bin/biome check && node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts` |
| **Estimated runtime** | ~5 s quick; ~90 s full (first scratch build copies node_modules once) |

Demo builds never run in the main checkout (D-20): `scripts/demo/build-demo.ts` builds in a scratch copy (gitignored files such as secrets.json are never copied) and refuses `--in-place` unless `CI=true`. Smoke uses an ephemeral 127.0.0.1 port, never 3000 or 3001.

---

## Sampling Rate

- **After every task commit:** Run `node_modules/.bin/vitest run src/demo` (plus the task's own `<automated>` command)
- **After every plan wave:** Run the full suite command (real suite + demo build + verify-export + smoke)
- **Before `/gsd-verify-work`:** Full suite green, the CI "Demo site" run on master green, and the live smoke (`node scripts/demo/smoke.ts --url https://patrickclery.github.io/discogs-ai-importer/ ...`) green
- **Max feedback latency:** 5 seconds for the quick command; build-backed checks are per task where the task touches the bundle

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | DEMO-01, DEMO-03, DEMO-09 (D-02, D-03, D-05, D-15, D-20) | T-05-01, T-05-06, T-05-07 | Static export of /spines answered by the fetch shim; zero /api requests reach the host; owner's .next untouched | e2e (scratch build + headless Chrome) | `node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect "spines/=No spines yet"` | ❌ created by task (tracer) | ⬜ pending |
| 5-01-02 | 01 | 1 | DEMO-01, DEMO-02 (D-02, D-03, D-04) | T-05-01, T-05-02, T-05-03, T-05-05, T-05-08 | No server code, server actions, secrets, family photos or basePath-less URLs in out/; real config unchanged; no demo imports from real code | unit + build check | `node_modules/.bin/vitest run src/demo && node scripts/demo/build-demo.ts && node_modules/.bin/biome check && node_modules/.bin/tsc --noEmit` | ❌ created by task | ⬜ pending |
| 5-02-01 | 02 | 1 | DEMO-04 (D-06, D-07, D-18) | T-05-04, T-05-13 | Assets only from cd-spines.heic, no EXIF/ICC/XMP, crops <= 1200 px and < 1,650,000 bytes total, no .heic/IMG_35 under demo/ | fixture script + unit | `node_modules/.bin/vitest run --config vitest.demo.config.ts scripts/demo/build-assets.demo.ts && node_modules/.bin/vitest run src/demo/fixtures.test.ts` | ❌ created by task | ⬜ pending |
| 5-02-02 | 02 | 1 | DEMO-05, DEMO-06 (D-08, D-10, D-13) | T-05-09, T-05-10, T-05-11, T-05-12 | Recordings text only (no URL/thumb/token/username), GET-only recorder, escaped SVG covers with no external refs | unit | `node_modules/.bin/vitest run src/demo/fixtures.test.ts src/demo/cover-svg.test.ts` | ❌ created by task | ⬜ pending |
| 5-03-01 | 03 | 2 | DEMO-06 (D-02, D-08) | T-05-14, T-05-15 | Real image URLs byte-identical; demo URLs only under basePath demo-assets | unit + type check | `node_modules/.bin/vitest run src/demo/asset-urls.test.ts src/components && node_modules/.bin/tsc --noEmit` | ❌ created by task | ⬜ pending |
| 5-03-02 | 03 | 2 | DEMO-03, DEMO-07 (D-04, D-07, D-09) | T-05-16, T-05-17 | Every D-09 state seeded; getSpines-equivalent rules; reset on reload; polling always ends | unit + e2e | `node_modules/.bin/vitest run src/demo && node_modules/.bin/tsc --noEmit && node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect "spines/=cd-spines.heic"` | ❌ created by task | ⬜ pending |
| 5-04-01 | 04 | 3 | DEMO-03, DEMO-08 (D-13, D-14) | T-05-18, T-05-19, T-05-20 | Review routes mirror real contracts; dialog searches only recordings; canned release for unknown ids; strict bodies | unit | `node_modules/.bin/vitest run src/demo/ops/review.test.ts src/demo && node_modules/.bin/tsc --noEmit` | ❌ created by task | ⬜ pending |
| 5-04-02 | 04 | 3 | DEMO-08 (D-09, D-14) | T-05-19, T-05-21 | Import phases, duplicate 409, already-in-collection, change match, retry and retry-all mirror real rules; nothing stays in flight | unit + e2e | `node_modules/.bin/vitest run src/demo && node_modules/.bin/tsc --noEmit && node_modules/.bin/biome check && node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect "spines/=cd-spines.heic"` | ❌ created by task | ⬜ pending |
| 5-05-01 | 05 | 3 | DEMO-08 (D-11, D-14, D-17) | T-05-22, T-05-27 | Dropped file never read (body readers spied); ~3 s run; second 61-spine copy; rescan per real route | unit | `node_modules/.bin/vitest run src/demo && node_modules/.bin/tsc --noEmit` | ❌ created by task | ⬜ pending |
| 5-05-02 | 05 | 3 | DEMO-02 (D-03, D-12) | T-05-23, T-05-25, T-05-26 | Settings actions resolve to a client module; credentials kept only as masked tails; real Claude/settings tests unchanged | unit + type check | `node_modules/.bin/vitest run src/demo src/server/settings.test.ts src/app/settings/actions.test.ts src/server/claude && node_modules/.bin/tsc --noEmit` | ❌ created by task | ⬜ pending |
| 5-05-03 | 05 | 3 | DEMO-08, DEMO-09 (D-05, D-12) | T-05-24, T-05-25 | Fixed same-site connect URL; all four pages export with the banner; no server-action ids in out/ | unit + e2e | `node_modules/.bin/vitest run && node_modules/.bin/tsc --noEmit && node_modules/.bin/biome check && node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect "/=Drop photos of your CD shelves" --expect "upload/=cd-spines.heic" --expect "spines/=cd-spines.heic" --expect "settings/=demo-user"` | ❌ created by task | ⬜ pending |
| 5-06-01 | 06 | 4 | DEMO-03, DEMO-10 (D-01, D-03, D-19, D-20) | T-05-28, T-05-29 | Every real route and call site covered by the mock; workflow least-privilege, no secrets, CI builds in place | unit + YAML parse + e2e | `node_modules/.bin/vitest run && node_modules/.bin/tsc --noEmit && node_modules/.bin/biome check && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/demo-pages.yml'))" && node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect "/=Drop photos of your CD shelves" --expect "upload/=cd-spines.heic" --expect "spines/=cd-spines.heic" --expect "settings/=demo-user"` | ❌ created by task | ⬜ pending |
| 5-06-02 | 06 | 4 | DEMO-10 (D-06, D-19) | T-05-30 | Blocking-human publish decision with the exact asset list before any push | checkpoint:decision | — (human decision, gate="blocking-human") | n/a | ⬜ pending |
| 5-06-03 | 06 | 4 | DEMO-10 (D-01, D-16, D-19) | T-05-30, T-05-31, T-05-32 | Pages source = Actions; CI run green; live site renders over the redirect with the shim | live check + human-check | `gh api repos/patrickclery/discogs-ai-importer/pages --jq .build_type \| grep -qx workflow && gh run list --workflow demo-pages.yml --branch master --limit 1 --json conclusion --jq '.[0].conclusion' \| grep -qx success && node scripts/demo/smoke.ts --url https://patrickclery.github.io/discogs-ai-importer/ --expect "/=Drop photos of your CD shelves" --expect "spines/=cd-spines.heic" --expect "settings/=demo-user"` | n/a (live) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Decision key D-01..D-20 numbers the CONTEXT.md `<decisions>` bullets in order (the key is repeated in every PLAN.md context). Requirement IDs DEMO-01..DEMO-10 are the research-proposed IDs (05-RESEARCH.md "Phase Requirements").

---

## Wave 0 Requirements

Vitest is already installed; no framework install. The phase's test and check files are created inside the tasks that need them (no separate Wave 0 plan):

- [ ] `scripts/demo/build-demo.ts`, `scripts/demo/smoke.ts` — 05-01 Task 1 (tracer's end-to-end verify)
- [ ] `scripts/demo/verify-export.ts`, `src/demo/{boundaries,next-config,dispatch}.test.ts` — 05-01 Task 2
- [ ] `vitest.demo.config.ts` (`setupFiles: []`), `src/demo/fixtures.test.ts` — 05-02 Task 1
- [ ] `src/demo/cover-svg.test.ts` — 05-02 Task 2
- [ ] `src/demo/asset-urls.test.ts`, `src/demo/read-model.test.ts` — 05-03
- [ ] `src/demo/ops/{review,imports}.test.ts` — 05-04
- [ ] `src/demo/ops/{uploads,account}.test.ts`, `src/demo/settings-actions.test.ts` — 05-05
- [ ] `src/demo/routes-coverage.test.ts` — 05-06 Task 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Click-through of the live demo (upload animation, two shelf copies, add/import, link existing, duplicate warning, retry and retry all, not on Discogs, dialog search and pasted link, Settings disconnect, reload resets) | DEMO-08, DEMO-09, DEMO-10 | Real pointer interactions and visual states in a normal browser; smoke only dumps the rendered DOM | 05-06 Task 3 `<human-check>`: plain do/see steps, collected at end-of-phase UAT |
| Publish approval of the exact sample-shelf assets | DEMO-10 (D-06, D-19) | Irreversible public exposure; only the owner can approve | 05-06 Task 2 checkpoint:decision (gate="blocking-human") |
| Discogs recording run | DEMO-05 (D-10) | Live calls with the owner's Discogs sign-in, run once by the developer (DEMO_RECORD=1); the committed result is then checked automatically by `src/demo/fixtures.test.ts` | 05-02 Task 2 action step 2 |
| Enforce HTTPS on patrickclery.com | D-16 | Owner's user-site setting, outside this repo; the demo is verified to work over the current http redirect | Owner toggles it in the patrickclery.github.io repo settings when ready |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the one exception is the 05-06 publish checkpoint:decision)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
