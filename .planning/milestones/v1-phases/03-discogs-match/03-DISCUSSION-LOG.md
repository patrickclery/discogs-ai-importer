# Phase 3: Discogs Match - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-20
**Phase:** 03-discogs-match
**Areas discussed:** Connect flow, Throttled queue, Automatic search, Candidates UI, Re-search / manual search / paste ID

Mode: `--auto`. The owner chose "Full auto", so every choice below is the recommended default with no user input.

---

## Connect flow

| Option | Description | Selected |
|--------|-------------|----------|
| OAuth 1.0a PLAINTEXT from a Settings card | Matches DISC-01 and PROJECT.md | ✓ |
| Personal access token | Simpler, but not what DISC-01 asks for | |

**Notes:** [auto] Callback uses the request origin (owner runs on 3001). Tokens are stored in secrets.json.

## Throttled queue

| Option | Description | Selected |
|--------|-------------|----------|
| Durable jobs table, discogs lane, ~1.1 s pacing + header-adaptive, 429 reschedules without using an attempt | Survives restarts; matches Phase 1 D-12 | ✓ |
| In-memory p-queue only | Loses backlog on restart | |

## Automatic search

| Option | Description | Selected |
|--------|-------------|----------|
| catno → artist+title → free text, stop at first hit, type=release, format=CD | DISC-03 order, CDs only | ✓ |
| Merge results from all stages | More requests per spine | |

## Candidates UI

| Option | Description | Selected |
|--------|-------------|----------|
| Card footer list, 3 shown + "Show all 10", locally cached thumbnails | Uses the Phase 2 footer slot | ✓ |
| Separate match page | Breaks crop-next-to-candidate core value | |

## Re-search / manual search / paste ID

| Option | Description | Selected |
|--------|-------------|----------|
| "Search again" button when fields changed; one "Search Discogs…" dialog for free text or URL/ID | Explicit, saves rate-limit budget | ✓ |
| Auto re-search on every edit | Burns requests while typing | |

## Claude's Discretion

Table names, pending-token storage, pacing constants, visual details.

## Deferred Ideas

Smart ranking, keyboard review / bulk accept, barcode search.
