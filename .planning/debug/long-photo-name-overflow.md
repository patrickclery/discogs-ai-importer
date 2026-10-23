---
status: diagnosed
trigger: "UAT 04 test 7: duplicate-warning dialog with a 123-char photo file name 'really broke the UI'; photo filter dropdown hard-clips long names"
created: 2026-10-22T00:00:00Z
updated: 2026-10-22T00:00:00Z
audit_acknowledged:
  milestone: v1
  at: 2026-10-23
  status: diagnosed
---

## Current Focus

bug_class: Bohrbug (deterministic CSS intrinsic-sizing)
hypothesis: CONFIRMED. Dialog: `.break-words` is emitted after `.[overflow-wrap:anywhere]` in the compiled CSS, so the title computes `overflow-wrap: break-word`, which does not lower min-content; the unbroken name becomes the title's min-content (~1131px), which propagates through AlertDialogHeader (grid item, min-width:auto) into the single implicit `auto` column of AlertDialogContent's grid. The box stays 512px but the column is 1131px. Select: ItemText span is display:flex (`*:[span]:last:flex`) with min-width:auto, so the inner `truncate` span never shrinks; SelectContent's overflow-x-hidden clips it; no title attribute.
test: Static repro with the real compiled CSS in headless Chrome at 1280x800.
expecting: n/a (confirmed)
next_action: Return ROOT CAUSE FOUND (goal: find_root_cause_only).

## Symptoms

expected: The duplicate-warning dialog stays inside its box with a very long photo file name: title wraps (breaking inside the unspaced name), captions clamp to two lines with full name on hover, both spine pictures fit, Cancel/Add another copy stay visible. Photo filter dropdown truncates long names with an ellipsis and shows the full name on hover.
actual: With a 123-char underscore-joined photo name the dialog box stays ~sm:max-w-lg wide but its content overflows far to the right: title runs off, description runs past, second spine picture and caption sit outside, Cancel/Add another copy pushed off-screen right. On /spines the photo filter Select dropdown hard-clips the long name at the popover edge with no ellipsis.
errors: None reported (Next dev overlay showed "1 Issue", content not captured)
reproduction: UAT 04 test 7. UPDATE photos SET original_name=<long name> in data/app.db (restore to IMG_3562.heic), click Add on a CD another spine already imported.
started: Discovered during UAT 2026-10-22.

## Eliminated

- hypothesis: Crop row (grid-cols-1 / sm:grid-cols-2) or captions set the min-content width.
  evidence: Compiled CSS shows grid-cols-1/2 = repeat(n, minmax(0,1fr)); figures have min-w-0, captions break-all. Repro variants B/C (title fixed, crop row unchanged) keep the column at 462px.
  timestamp: 2026-10-22T00:00:00Z
- hypothesis: Footer buttons (whitespace-nowrap, shrink-0) widen the column.
  evidence: Variants B/C keep the Add button right edge at 871px, inside the 896px dialog edge.
  timestamp: 2026-10-22T00:00:00Z
- hypothesis: The select trigger also overflows with the long value selected.
  evidence: Trigger repro (w-64): value span 218px, truncate span clientWidth 218 vs scrollWidth 865 -> ellipsis works there.
  timestamp: 2026-10-22T00:00:00Z

## Evidence

- timestamp: 2026-10-22T00:00:00Z
  checked: knowledge-base.md
  found: No knowledge base file exists.
  implication: No known-pattern candidate.
- timestamp: 2026-10-22T00:00:00Z
  checked: src/components/duplicate-import-dialog.tsx:143
  found: AlertDialogTitle className="break-words [overflow-wrap:anywhere]". Both survive `cn` merging (checked with node).
  implication: Two declarations of the same property, so the winner depends on stylesheet order.
- timestamp: 2026-10-22T00:00:00Z
  checked: .next/dev/static/chunks/src_app_globals_css_css_*.single.css
  found: `.\[overflow-wrap\:anywhere\]{overflow-wrap:anywhere}` at offset 29291, `.break-words{overflow-wrap:break-word}` at 29358 (later, same specificity).
  implication: The title computes overflow-wrap:break-word. Per CSS Text 3, break-word opportunities are not counted for min-content, so min-content = the whole unbroken name.
- timestamp: 2026-10-22T00:00:00Z
  checked: src/components/ui/alert-dialog.tsx:61,78
  found: AlertDialogContent is `grid w-full max-w-[calc(100%-2rem)] sm:max-w-lg` with no grid-template-columns (one implicit auto column). AlertDialogHeader is a grid with no min-w-0, and Title has no min-w-0.
  implication: The auto column's base size = the largest child min-content contribution. The header's min-content = the title's min-content.
- timestamp: 2026-10-22T00:00:00Z
  checked: Headless Chrome repro with the real compiled CSS at 1280x800 (scratchpad repro/index.html)
  found: A (as shipped) overflowWrap=break-word, dialogW=512, gridColumn=1131px, titleRight=1540, fig2Left=979 (dialog right edge 896), AddBtnRight=1540 (> viewport 1280). B ([overflow-wrap:anywhere] only) and C (break-all): column 462px, everything inside. D (as shipped + min-w-0 on header): column 462px and buttons/crops inside, but the title is still 1131px wide (it overflows the header).
  implication: Exact reproduction of UAT symptoms. The overflow-wrap cascade is the root cause. min-w-0 on the header is only containment and does not fix the title.
- timestamp: 2026-10-22T00:00:00Z
  checked: src/components/spines-filter-bar.tsx:76-78 and src/components/ui/select.tsx:111,124
  found: SelectItem applies `*:[span]:last:flex`, so the ItemText span is display:flex with min-width:auto. The child `<span className="truncate">` is its flex item (min-width:auto). There is no title attribute. Repro S1: truncate span clientWidth 865 = scrollWidth 865 (no ellipsis), content 382px with overflow-x-hidden, which clips. S2 (min-w-0 on the ItemText span): truncate 334 < 865, ellipsis active.
  implication: The min-width:auto chain on the ItemText flex span defeats `truncate`. Without a title, the full name cannot be read on hover.

## Resolution

root_cause: (1) Dialog: in duplicate-import-dialog.tsx the title carries both `break-words` and `[overflow-wrap:anywhere]`. Tailwind 4.3 emits `.break-words` later, so `overflow-wrap: break-word` wins. That value does not reduce min-content, so the 123-char unspaced name sets the title's min-content (~1131px). That size propagates through AlertDialogHeader (grid item, min-width:auto) into AlertDialogContent's single implicit `auto` grid column. The box stays 512px, but the column, and with it the description, crop row and right-justified footer, is 1131px wide. (2) Select: SelectItem's `*:[span]:last:flex` makes the ItemText span a flex container with min-width:auto, so the inner `truncate` span keeps its full content width (no ellipsis) and SelectContent's overflow-x-hidden hard-clips it. Neither the item nor the span has a `title` for hover.
fix:
verification:
files_changed: []
