---
status: diagnosed
trigger: "UAT G-02 test 3: Couldn't refresh alert never clears after server restart when all photos are Done"
created: 2026-10-20T00:00:00Z
updated: 2026-10-20T00:00:00Z
audit_acknowledged:
  milestone: v1
  at: 2026-10-23
  status: diagnosed
---

## Current Focus

hypothesis: CONFIRMED - refetchInterval returns false when no photo is active and ignores error state, so after a focus-triggered failed refetch nothing refetches while the tab stays focused
test: done (scratchpad repro against query-core 5.104.2)
expecting: n/a
next_action: return ROOT CAUSE FOUND to plan-phase --gaps
bug_class: Bohrbug (deterministic)

## Symptoms

expected: On /upload and /spines, when the server goes down the last data stays visible under a "Couldn't refresh" alert; once the server is back the alert clears on the next successful poll.
actual: After server restart the alert stays up indefinitely while the tab stays focused. All photos Done, prod build. Alert only appeared after tab refocus.
errors: none
reproduction: UAT test 3 — /upload with all photos Done, stop server, refocus tab (alert appears), restart server, keep tab focused: alert never clears.
started: discovered during Phase 02 UAT

## Eliminated

## Evidence

- timestamp: 2026-10-20T00:00:00Z
  checked: src/lib/photo-status.ts:93-98, src/components/photo-status-list.tsx:36-41, src/components/spines-view.tsx:160
  found: refetchInterval = photosRefetchInterval(q.state.data?.photos) -> ACTIVE_POLL_MS (1500) only if some photo is queued/preparing/calling/parsing, else false. No retry or error-aware branch.
  implication: with all photos Done, the query never polls, in success or error state.

- timestamp: 2026-10-20T00:00:00Z
  checked: src/app/providers.tsx
  found: only refetchOnWindowFocus: true; default retry (3, exponential backoff) applies.
  implication: the only refetch triggers when idle are focus/reconnect/mount; reconnect fires only on browser online events, not on server restart.

- timestamp: 2026-10-20T00:00:00Z
  checked: 02-UI-SPEC.md:183 and :358
  found: spec mandates refetchInterval false when nothing active, and also mandates alert copy "retrying every few seconds" — the spec contradicts itself for the idle case.
  implication: the bug is a spec-level gap faithfully implemented, not a deviation.

- timestamp: 2026-10-20T00:00:00Z
  checked: scratchpad repro.mjs - QueryObserver (query-core 5.104.2, window shimmed so timers run) with the app's refetchInterval fn, all data 'done'; fetch fails (simulated focus refetch while server down), then server comes back and tab stays focused 5s
  found: current fn -> isError=true, fetches stays 2 (no refetch). Variant returning 1500 when q.state.status==='error' -> fetches 3, isError=false (alert clears).
  implication: confirms the interval function alone causes the stuck alert; making it error-aware fixes recovery.

## Resolution

root_cause: photosRefetchInterval (src/lib/photo-status.ts:94-98) decides polling purely from the last data (active photo => 1500ms, else false) and ignores query error state. With all photos Done, refetchInterval is false; TanStack keeps the last data on error, so after a refetchOnWindowFocus fetch fails nothing schedules another fetch while the tab stays focused, and isError never resets. Spec gap: 02-UI-SPEC.md:183 mandates false when idle while :358 promises 'retrying every few seconds'.
fix:
verification:
files_changed: []
