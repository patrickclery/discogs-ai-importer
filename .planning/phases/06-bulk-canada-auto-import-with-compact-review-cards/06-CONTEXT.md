# Phase 6: Bulk Canada auto-import with compact review cards - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

After photographing a shelf, the owner can import every disc in bulk as the Canadian pressing of its top match, without verifying hundreds one by one. The review list gets a compact card layout (spine crop with the top match directly below it; edit fields hidden until the card is expanded) so many cards fit on one screen, plus multi-select and a bulk action. The bulk action resolves each selected spine's top match to its Canada release (falling back visibly when none exists) and adds it to the Discogs collection through the existing rate-limited queue and Phase 4 import pipeline.

</domain>

<decisions>
## Implementation Decisions

### Canada resolution
- D-01: Resolve using the top match's (rank-1 candidate) `master_id`: `GET /masters/{id}/versions?country=Canada&format=CD`. One Discogs read per spine. The candidate rows already store `masterId` and `country`. The new endpoint must be added to the client allowlist (Phase 4 D-06 style, GET only).
- D-02: If the top match's `country` is already Canada, use it as is, with no extra call.
- D-03: Several Canadian versions: prefer a CD format, then the same label as the top match, then the earliest year.
- D-04: No `master_id`, or no Canadian version: import the top match anyway, and show "No Canadian pressing, used {country}" on the card. The fallback must be visible and recorded per spine.

### Selection and bulk action
- D-05: A checkbox on each card, plus a sticky action bar with "Select all shown" (respects the current status filter) and a selected count.
- D-06: Eligible spines are active, have a top match, and are not imported, importing or `not_on_discogs`. Ineligible spines show a disabled checkbox with the reason.
- D-07: One confirm dialog, "Import N to {folder} as Canadian pressings", then Start.
- D-08: Resolution runs as a background job per spine (resolve Canada, then create an import and enqueue the existing `add_to_collection` job), through the rate-limited Discogs queue. No up-front preview step.
- D-09: Local duplicates (the release is already imported or importing from another spine, Phase 4 D-04): skip and flag "Already imported from spine #n". Never add another copy automatically. The remote "already in your collection" check (Phase 4 D-05) still runs per job, unchanged.

### Compact card layout
- D-10: A collapsed card shows a checkbox, #n, status badge(s), the spine crop, then the top match directly below it (thumbnail, artist – title, year, country, catno).
- D-11: An "Edit" chevron expands the card in place to today's full card (fields, all matches, actions). Edit fields stay hidden until it is expanded.
- D-12: Responsive grid: 1 column on phones, 2 at sm, 3 at lg, 4 at xl.
- D-13: A Compact/Detailed toggle in the filter bar. Compact is the default, and the choice is kept in the URL (nuqs, like the status filter).

### Country setting, feedback and demo
- D-14: A "Preferred country" setting on the Settings Discogs card, defaulting to "Canada", stored in the `settings` table. The bulk action label uses it.
- D-15: Each card shows a badge, "Canada" (the preferred country) or "Fallback: {country}", next to the import state. A "Fallback" filter lists the non-preferred ones, and a toast reports when the batch finishes.
- D-16: Low-confidence spines are selectable like any other, and select-all includes them. The worst-field badge stays visible on the compact card.
- D-17: The demo site (Phase 5) stubs the versions endpoint and the bulk flow with canned data so the demo shows bulk import end to end. Zero real `/api` or Discogs calls still holds.

### Post-research decisions (2026-10-23)
- D-18: Bootleg ("Unofficial Release") versions rank below official ones. Pick one only when it is the only version in the preferred country.
- D-19: A combined country such as "USA & Canada" counts as the preferred country. It ranks below exact-country versions and above the fallback.
- D-20: Spines whose earlier import failed can be selected for a bulk run. A failed import that wrote an intent still goes through the Phase 4 D-07 reconcile/Retry rule; never POST blindly.
- D-21: Unknown-master guard: a versions answer with more than 1,000 items, or whose chosen version's title does not match the top match, falls back to the top match (D-04). Do not add an extra GET /masters/{id}.

### Claude's Discretion
- Job type naming, schema additions (for example the resolved release and fallback reason on the import or spine), the batch-tracking mechanism for the "batch finished" toast, and how the expanded card reuses the existing SpineCard and DiscogsMatches components.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/spine-card.tsx` (SpineCard with badges/statusSlot/footer slots), `spine-crop.tsx`, `discogs-matches.tsx`, `candidate-row.tsx`, `import-state-badge.tsx`, `spines-filter-bar.tsx`, `review-status-filter.tsx`, `spines-view.tsx` (530 lines, the review list)
- `src/server/imports/store.ts`: `createImport({spineId, candidateId, allowDuplicate})` with not_importable / not_on_discogs / already_confirmed / duplicate checks; `enqueueImport`; the `add_to_collection` and `check_import` job types
- `src/server/discogs/client.ts` (allowlisted, rate-limited client), `enqueue.ts`, `collection.ts`, `folders.ts`
- `src/server/db/schema.ts`: `discogs_candidates` has `master_id`, `country`, `labels_json`, `formats_json`, `rank`; `imports` stores `candidate_json` (snapshot)

### Established Patterns
- A SQLite jobs table plus a worker with p-queue pacing for Discogs; job dedupe keys; reconcile before POST (Phase 4 D-07)
- TanStack Query polling for status; shadcn/ui components; URL state via nuqs
- Demo build swaps routes for stubs (`src/demo/routes.ts`, `*.demo.tsx` pages) with recorded fixtures

### Integration Points
- `createImport` currently takes a `candidateId`. A Canada release that isn't among the stored candidates needs a candidate row (for example source `release`/`canada`) or an extended import input.
- The spines review page (`src/app/spines/page.tsx`) and its demo twin
- The Settings Discogs card (next to the collection folder field)

</code_context>

<specifics>
## Specific Ideas

- The owner photographs whole shelves (hundreds of discs) and mostly owns Canadian pressings, so the default path has to be "select all → import" with fallbacks easy to spot afterwards.

</specifics>

<deferred>
## Deferred Ideas

- Shift-click range select
- Preview-before-import of the resolved releases
- Undo of a bulk import

</deferred>
