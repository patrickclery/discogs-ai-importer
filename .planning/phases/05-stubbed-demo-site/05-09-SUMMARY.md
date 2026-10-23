---
phase: 05-stubbed-demo-site
plan: 09
subsystem: demo-deploy
tags: [demo, github-pages, deploy, publish]
status: complete

requires: ["05-08"]
provides:
  - "GitHub Pages enabled with build_type workflow, serving the demo at http://patrickclery.com/discogs-ai-importer/ (github.io URL 301-redirects there)"
  - "First successful Demo site deploy from master (run 40005241012, head 95d6548)"
affects: []

actuals:
  tokens: 1500
  tasks: 2
  commits: 0
plan_head_before: 95d6548223beceba5427da3f1763f0f8dfa0f5de
plan_head_after: 95d6548223beceba5427da3f1763f0f8dfa0f5de

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Owner answered publish at the blocking-human gate; Pages enabled via one gh api POST (build_type workflow) before the push"
  - "Workflow needed no changes: first live run succeeded, no Jekyll filtering of _next (no .nojekyll fallback required)"

metrics:
  duration: ~5 min (executor; outward steps done by orchestrator)
  completed: 2026-10-23
---

# Phase 5 Plan 09: Publish the demo to GitHub Pages Summary

The demo is live: Pages (source GitHub Actions) serves the static export at http://patrickclery.com/discogs-ai-importer/, deployed by the Demo site workflow on the push of master, with the banner, the sample shelf and all JS chunks loading.

## Tasks

| Task | Name | Result |
|------|------|--------|
| 1 | Publish decision (checkpoint:decision, blocking-human) | Owner answered "publish" |
| 2 | Enable Pages, push master, watch deploy, live checks | Outward steps (gh api POST pages, git push 8233646..95d6548, run watch) done by the orchestrator; executor re-ran the read-only checks below |

## Live verification (re-run by executor, 2026-10-23)

- `gh api .../pages --jq .build_type` → `workflow`; html_url http://patrickclery.com/discogs-ai-importer/; https_enforced false (owner enables, D-16)
- Latest Demo site run on master: 40005241012, conclusion success, head 95d6548
- `curl -sSIL https://patrickclery.github.io/discogs-ai-importer/` → 301 to http://patrickclery.com/discogs-ai-importer/ → 200
- Deployed chunk `/discogs-ai-importer/_next/static/chunks/0jxei42ypspyo.js` → 200 (no Jekyll filtering, RESEARCH A3)
- `/does-not-exist/` → 404
- `node scripts/demo/smoke.ts --url https://patrickclery.github.io/discogs-ai-importer/ ...` → PASS 4 pages, zero /api requests (exit 0)
- Orchestrator also confirmed: banner text on /spines/, demo-assets vision.jpg (481377 B), thumb.webp, crops/00.webp, covers/10355365.svg all 200

## Deviations from Plan

None in substance. Task 2's outward steps (enable Pages, push, watch the run) were performed by the orchestrator after approval rather than by this executor; no code changes were needed, so this plan has no task commits (commits: 0 is legitimate, docs-only).

## Pending human check

The owner's click-through (human-check in Task 2: upload, Spines states, Add, Link existing, duplicate warning, Retry / Retry all, Not on Discogs, Search dialog, Settings Disconnect, reload resets) is queued for end-of-phase UAT. Enforce HTTPS on the user site remains the owner's step (D-16).

## Self-Check: PASSED

- Pages build_type workflow, run 40005241012 success, live smoke exit 0, chunk 200 — all re-verified above.
