# Phase 4 — UI Review

**Audited:** 2026-10-22
**Baseline:** 04-UI-SPEC.md (approved)
**Screenshots:** not captured (code-only audit; the 3001 instance may predate Phase 4 and must not be touched, so no separate build was made)
**Interaction captures:** off (workflow.ui_interaction_capture is false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All 30 contract strings checked are present, and no jargon reaches the screen |
| 2. Visuals | 3/4 | Phase 4 action buttons use `size="sm"` (32px), under the 36px target rule |
| 3. Color | 4/4 | Accent appears only on the declared items, success/warning only on icons, no hex values |
| 4. Typography | 4/4 | 4 sizes and 2 weights; no `font-semibold` or `font-bold` (dropdown-menu too) |
| 5. Spacing | 3/4 | Mostly on scale; there are off-scale nudges (`gap-3`, `mt-0.5`, `mt-px`) and the 32px button height |
| 6. Experience Design | 3/4 | State coverage is complete in code, but the 6 backstop visual checks were never run |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **WARNING: Action buttons are 32px tall, not 36px.** Affects "Add to {folder}", Retry import, Change match, Link existing copy, Add another copy, Unmark and Mark not on Discogs. These sit about 230 times on one page, so a smaller hit area means more mis-clicks. Fix: drop `size="sm"` (use the 36px default) in add-to-collection-button.tsx:175, confirmed-match.tsx:308,332, already-in-collection.tsx:114,133, not-on-discogs-line.tsx:29 and discogs-matches.tsx:257,385. Or record a spec exception if the dense 32px is wanted.
2. **WARNING: The 6 backstop visual checks were never run.** These are: a 60-char folder in Add at 360px, a long folder in the already-in-collection line, a 120-char filename in the duplicate dialog, the card footer at 360px in each import state, and the section sub-line at 360px. Overflow bugs are likely here and code review can't confirm them. Fix: seed a temp DATA_DIR and run a `.next/verify` instance on a spare port. Capture each state at 360px and 1280px.
3. **WARNING: The duplicate dialog's crop wells are capped at `max-h-12` (48px).** A spine crop shrunk to 48px is usually too small to tell "same CD in two photos" from "a real second copy", and the dialog exists to let the owner make that call. Fix: raise it to `max-h-24` or `max-h-32` in duplicate-import-dialog.tsx:78 and amend the spec. This value comes from the spec, so the spec's choice is the defect.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- Every Copywriting Contract row checked was found verbatim in components/ or lib/: the 7 empty states, the page description and its `l = 0` variant, the sub-line, the waiting, importing and imported lines, the failure classes (lib/import-view.ts), the link, mark, unmark, retry and moved toasts, the folder copy and the header status (lib/status-text.ts).
- No string literal contains token, OAuth, queue, job, lane, 429, 409 or rate limit.
- Copies are pluralized (lib/import-view.ts:211-214).
- No generic Submit/OK labels.

### Pillar 2: Visuals (3/4)
- Icon-only controls have labels: the menu trigger (spine-action-menu.tsx:188) and the folder refresh button (collection-folder-field.tsx:237).
- Badges use icon plus text, so color is never the only signal (import-state-badge.tsx:29-67).
- WARNING: 32px buttons (see Fix 1).
- WARNING: The duplicate crop wells are too small to compare spines (see Fix 3).
- WARNING: add-to-collection-button.tsx:177 sets an `aria-label` that replaces the visible, truncated label. Check that it stays in step with the visible text so the accessible name matches what voice-control users see.

### Pillar 3: Color (4/4)
- `text-primary` appears only on the "Open Settings" links (confirmed-match.tsx:123; discogs-matches.tsx:128 is Phase 3). discogs-card.tsx:66,162 are earlier-phase links.
- There is no `variant="default"` besides the spec'd decision and dialog confirms.
- `text-success` is used 3 times and `text-warning` 6 times, all on icons.
- `text-destructive` is limited to error lines, the Failed count (review-status-filter.tsx) and the failed badge.
- No hex or rgb values in components.

### Pillar 4: Typography (4/4)
- Sizes across 20 Phase 4 files: `text-xs` ×22, `text-sm` ×7, `text-base` ×6, `text-2xl` ×1. This matches the 4-size scale.
- Weights are 400/500 only. `ui/dropdown-menu.tsx` was cleaned of `font-semibold` as required.

### Pillar 5: Spacing (3/4)
- The scale is followed in most places: `gap-2` ×22, `gap-4` ×11, `gap-1` ×10, `pt-16 pb-12` empty states, `p-2` confirmed box, and the filter wrapper `-mx-1 px-1 pb-1` with `w-max` (review-status-filter.tsx:57-62).
- Off-scale values: `gap-3` (discogs-card.tsx:92), `mt-0.5` (collection-folder-field.tsx:272) and `mt-px` icon nudges (not-on-discogs-line.tsx:23). These are minor.
- WARNING: The `size="sm"` buttons are 32px tall, which breaks the declared 36px target exception.

### Pillar 6: Experience Design (3/4)
- **Loading:** a pending label and spinner on every mutation, the loading skeleton has the second filter row (app/spines/loading.tsx:12), and the badge shows a Spinner for Importing.
- **Errors:** inline `role="alert"` lines throughout, with no `toast.error` anywhere. Toasts are used for success only, as spec'd.
- **Empty:** all 7 per-status empties plus the combined one are present.
- **Focus management** is implemented: focus moves after Add, Change match, Mark and Unmark, Dismiss, and on leaving the filter (spines-view.tsx:95-101).
- **Duplicate dialog:** captions are `line-clamp-2`, and the crops stack below 640px.
- WARNING: None of the long-text or overflow backstops or the per-state rendering has been seen on screen (see Fix 2). The score stays at 3 until they are.

Registry audit: 1 block (dropdown-menu, shadcn official), no third-party registries, no flags.

---

## Files Audited
src/components/: add-to-collection-button, already-in-collection, collection-folder-field, confirmed-match, duplicate-import-dialog, import-state-badge, not-on-discogs-line, retry-all-failed-button, review-status-filter, spine-action-menu, spines-filter-bar, spines-view, photo-section, discogs-matches, candidate-row, candidate-list, dismiss-spine-button, status-indicator, discogs-card, import-ui-context, ui/dropdown-menu, ui/button; src/app/spines/loading.tsx; src/lib/import-view.ts, src/lib/status-text.ts
