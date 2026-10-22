# Phase 03 — UI Review

**Audited:** 2026-10-21
**Baseline:** 03-UI-SPEC.md (approved)
**Screenshots:** not captured (no dev server on localhost:3001; code-only audit)
**Interaction captures:** off (workflow.ui_interaction_capture is false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Near-verbatim to contract; finish-connect failures reuse "Couldn't start connecting", one error toast, unspecced reconnect copy |
| 2. Visuals | 3/4 | Focal points match spec; dialog result rows nest an `<a>` inside a `<label>` |
| 3. Color | 3/4 | Accent confined to the reserved list; link styling inconsistent (hover-only underline on "Open Settings") |
| 4. Typography | 3/4 | Search-dialog and Disconnect titles render at 18px (`text-lg`), off the 4-size scale |
| 5. Spacing | 3/4 | `gap-3` (12px) used in 3 Phase 3 surfaces, off the declared 4/8/16/24 scale |
| 6. Experience Design | 3/4 | States well covered; dialog failure/not-found results are not announced; error shown as toast |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **Dialog titles at 18px** (WARNING) — `DialogTitle`/`AlertDialogTitle` default to `text-lg`, breaking the "four sizes only" contract (spec: dialog title = Heading 16px) — pass `className="text-base"` to `DialogTitle` in `discogs-search-dialog.tsx:469` and `AlertDialogTitle` in `disconnect-discogs-button.tsx:104` (or change the ui defaults to `text-base`).
2. **External link nested inside a radio `<label>`** (WARNING) — `discogs-search-dialog.tsx:261-279` wraps `CandidateRowContent` (which contains an `<a>` icon button) in `<label htmlFor>`; interactive content inside a label is invalid and a mis-click on the link area can toggle selection or vice versa — make the row a `div` with the label wrapping only the radio + text column, and keep the link as a sibling.
3. **Errors outside the inline/persistent rule** (WARNING) — `callback-url-field.tsx:27` uses `toast.error(...)` on copy failure (spec: toasts are success-only), and dialog `not_found`/`failed` results (`discogs-search-dialog.tsx:233-244`) have no `role="alert"` and `searchAnnouncement` returns `''` for them — render the copy failure inline under the well, and add `role="alert"` (or extend `searchAnnouncement`) for not-found/failed.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- PASS: Settings card, notices, reconnect alert, disconnect confirm, matches lines, badges, dialog copy and header status strings match the contract verbatim (`discogs-card.tsx`, `discogs-connect-notice.tsx`, `discogs-matches.tsx:28-36`, `discogs-search-dialog.tsx:61-90`, `lib/status-text.ts:56-81`). Pluralization present (`search-state-badge.tsx:39`, `resultsCount`).
- WARNING: `paste-code-form.tsx:45-47` — unmapped finish failures read `Couldn't start connecting: {reason}. Try again.`; that is the Connect-start copy, wrong for a finish step. Use e.g. `Couldn't finish connecting: {reason}. Try again.`
- WARNING: `callback-url-field.tsx:27` — `Couldn't copy. Select the address and copy it yourself.` is unspecced and delivered as a toast.
- WARNING: Unspecced reconnect variants added (WR-05): `discogs-not-connected-alert.tsx:15-17` (title `Reconnect Discogs`, a CTA label used as an Alert title) and `discogs-matches.tsx:88` (`Reconnect Discogs to find matches.`). Reasonable, but backfill into UI-SPEC; the Alert title should be a statement (e.g. `Discogs stopped accepting this app`, matching Settings).
- MINOR: Dialog submit reads `Search` (`discogs-search-dialog.tsx:510`). The spec contradicts itself (Copywriting: `Search`; Layout: "Search Discogs"); implementation follows the copy table. Resolve in spec.

### Pillar 2: Visuals (3/4)
- PASS: One accent per surface. Connect is outline+disabled until keys are saved (`connect-discogs-button.tsx:99`); the reconnect state hides the account Connect button.
- PASS: Icon-only buttons have aria-labels and tooltips (`callback-url-field.tsx:47`, `candidate-row.tsx:111`). The thumb fallback avoids broken-image glyphs (`candidate-row.tsx:34-39`).
- WARNING: Nested interactive content in a label (see Fix 2).
- MINOR: In `candidate-list.tsx:105` the "Show all" rest list adds `border-t`, but the inline list has no bottom border, so the divider between row 3 and row 4 relies on this extra border. Verify visually that it doesn't double up.
- Not verified visually: long-title clamp, 360px footer wrap and 25-result scroll (spec backstops). No screenshots.

### Pillar 3: Color (3/4)
- PASS: Accent uses are in 4 files, all on reserved items: the username link, the developers/applications links, the "Open Settings" text link, the selected result ring (`discogs-search-dialog.tsx:267`), and the primary buttons. The `/spines` Alert "Open Settings" is outline as specified.
- PASS: Warning is icon-only (`discogs-card.tsx:39,88`, `discogs-matches.tsx:105`). Success is limited to the Connected badge and the test result. No hardcoded hex or rgb.
- WARNING: Inline accent links are inconsistent. Settings links are `underline underline-offset-4` (always underlined), while the card's "Open Settings" is `hover:underline` only (`discogs-matches.tsx:92`), so the accent color alone carries the link affordance there. Standardize on always-underlined.

### Pillar 4: Typography (3/4)
- Distribution app-wide: text-xs 41, text-sm 42, text-base 16, text-2xl 3, text-lg 3 (ui defaults only). Weights: no `font-semibold`/`font-bold` anywhere.
- WARNING: The Search dialog title and the Disconnect AlertDialog title inherit `text-lg` (18px) from `ui/dialog.tsx:128` and `ui/alert-dialog.tsx:110`. Spec: Heading 16px/500.
- MINOR: `CardTitle` keeps `leading-none` (`ui/card.tsx:33`), so the "Discogs" title renders at 16/16 rather than the declared 16/24.
- PASS: Candidate title Body 500 with `line-clamp-2` and `title`. Mono `tabular-nums` only on the candidate count.

### Pillar 5: Spacing (3/4)
- PASS: Rows use `gap-4 py-2`, thumbs are `size-16`, the matches section is `gap-4`, the button rows are `gap-2`, the dialog is `sm:max-w-2xl`, results are `min-h-40 max-h-[50vh]` and the `/spines` stack is `gap-6`, all per spec.
- WARNING: `gap-3` (12px, undeclared) appears in `discogs-card.tsx:90`, `discogs-not-connected-alert.tsx:31` and `test-discogs-button.tsx:85`. Use `gap-2` or `gap-4`.
- MINOR: Optical nudges `mt-0.5` (`test-discogs-button.tsx:106,111`) and `p-0.5` (ring clearance, `discogs-search-dialog.tsx:256`) are acceptable but undeclared. The dialog's before-search line uses `py-8` (`:197`), an undeclared vertical offset.

### Pillar 6: Experience Design (3/4)
- PASS: Pending states on every action (Opening Discogs…, Connecting…, Testing…, Disconnecting…, Queuing…, Adding…). Disabled states with tooltip wrappers. Skeletons and retry for Show all. The disconnect confirm stays open on error. Focus handoffs after disconnect and finish (`focusConnectWhenReady`, `focusTestWhenReady`). The master-link refusal happens client-side.
- WARNING: The copy failure is a toast, and dialog not-found/failed results are not announced (see Fix 3).
- WARNING: `discogs-matches.tsx:200-203`: state `done` with 0 stored candidates (for example, after manual rows are removed or a dedup edge) renders no body, while the badge says `0 candidates`. Fall back to the no-matches line.
- MINOR: The add-success toast uses `toast(...)` rather than `toast.success(...)` (`discogs-search-dialog.tsx:434`), which is inconsistent with the other success toasts.
- MINOR: `Line` in the dialog has no `role="status"` for the Searching state, while the card version does (`discogs-matches.tsx:177`).

Registry audit: shadcn initialized. UI-SPEC lists only shadcn official components (collapsible), so no third-party blocks were checked and there are no flags.

---

## Files Audited
- src/components/callback-url-field.tsx
- src/components/candidate-list.tsx
- src/components/candidate-row.tsx
- src/components/connect-discogs-button.tsx
- src/components/discogs-card.tsx
- src/components/discogs-connect-notice.tsx
- src/components/discogs-matches.tsx
- src/components/discogs-not-connected-alert.tsx
- src/components/discogs-search-dialog.tsx
- src/components/disconnect-discogs-button.tsx
- src/components/paste-code-form.tsx
- src/components/search-state-badge.tsx
- src/components/test-discogs-button.tsx
- src/components/spines-view.tsx (lines 180-205)
- src/components/status-indicator.tsx, src/lib/status-text.ts (Discogs segment)
- src/components/ui/card.tsx, ui/dialog.tsx, ui/alert-dialog.tsx (title defaults)
