---
phase: "06"
slug: "bulk-canada-auto-import-with-compact-review-cards"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-24"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (`pool: 'forks'`, node env, `server-only` stubbed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `./node_modules/.bin/vitest run <file> && ./node_modules/.bin/tsc --noEmit` |
| **Full suite command** | `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/biome check` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched file's `vitest run <file>` + `tsc --noEmit`
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Filled by the planner per task. Requirement → test map from RESEARCH.md:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| BULK-06 | pickVersion ordering and guards | unit | `vitest run src/lib/pressing.test.ts` | ❌ W0 | ⬜ pending |
| BULK-06 | parseVersions envelope / drop / cap | unit | `vitest run src/server/discogs/versions.test.ts` | ❌ W0 | ⬜ pending |
| BULK-06/07/08 | resolve_pressing handler outcomes, interleaving | integration | `vitest run src/server/jobs/handlers/resolve-pressing.test.ts` | ❌ W0 | ⬜ pending |
| BULK-06 | single add_to_collection enqueue site | static scan | `vitest run src/server/imports/store.test.ts` | ✅ | ⬜ pending |
| BULK-04/05 | eligibility + start route | unit + route | `vitest run src/lib/bulk-eligibility.test.ts src/app/api/spines/bulk-import/route.test.ts` | ❌ W0 | ⬜ pending |
| BULK-10 | run summary + fallback filter | integration | `vitest run src/server/bulk/queries.test.ts` | ❌ W0 | ⬜ pending |
| BULK-11 | failed lookups, retry, interrupted, IMPORTS_LEFT | unit + integration | `vitest run src/lib/review-status.test.ts src/server/bulk/store.test.ts src/server/discogs/status.test.ts` | ✅ / ❌ W0 | ⬜ pending |
| BULK-09 | preferred country setting | unit | `vitest run src/server/settings.test.ts src/app/settings/actions.test.ts` | ✅ | ⬜ pending |
| BULK-01/02/03 | compact card helpers, expand state, layout toggle | unit | `vitest run src/components` | ❌ W0 | ⬜ pending |
| BULK-12 | demo bulk flow | unit | `vitest run src/demo` | ✅ | ⬜ pending |
| — | migration applies to a Phase 5 DB copy | integration | `vitest run` (temp data dir) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/fixtures/discogs/master-versions-canada.json`, `master-versions-bogus.json`
- [ ] `src/lib/pressing.test.ts`, `src/lib/bulk-eligibility.test.ts`
- [ ] `src/server/discogs/versions.test.ts`
- [ ] `src/server/jobs/handlers/resolve-pressing.test.ts`
- [ ] `src/server/bulk/store.test.ts`, `src/server/bulk/queries.test.ts`
- [ ] `src/app/api/spines/bulk-import/route.test.ts`
- [ ] `/masters/{id}/versions` in `test/fixtures/fake-discogs.mjs`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Compact cards fit many per screen; expand/collapse feel | BULK-01/02 | Visual layout | Open /spines on port 3001, check several cards fit per screen and expanding one keeps it open while the list refreshes |
| Real bulk import of 3–5 spines lands Canadian pressings | BULK-06/07 | Live Discogs account | Select 3–5 spines, run bulk import, check the releases on discogs.com |
| Crash mid-run leaves no duplicates | BULK-11 | Process kill | Stop the server mid-run, restart, confirm no duplicate copies in the collection |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
