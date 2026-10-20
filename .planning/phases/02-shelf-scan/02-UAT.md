---
status: testing
phase: 02-shelf-scan
source: [02-VERIFICATION.md]
started: 2026-10-20T05:55:08.198Z
updated: 2026-10-20T05:55:08.198Z
---

## Current Test

number: 2
name: On /upload, drag several real shelf photos at once (include an iPhone HEIC), and also drop a PDF, a duplicate photo and a file of about 70 MB
expected: |
  Each photo goes Waiting to upload, then Uploading, then Queued, then Analyzing with a ticking m:ss timer, then Done with its spine count. The PDF and the 70 MB file become failed rows with their copy and are never sent. The duplicate shows the 'already uploaded... no new Claude call' toast and an 'Already uploaded' badge.
awaiting: user response

## Tests

### 1. Run the end-to-end fake-CLI proofs after the review fixes: node scripts/verify-scan.ts, node scripts/verify-scan-recovery.ts, node scripts/verify-rescan.ts
expected: Each one ends with its OK line. verify-scan-recovery shows exactly one -p invocation after the kill -9.
result: pass (orchestrator ran all three scripts after the review fixes: each printed its OK line)

### 2. On /upload, drag several real shelf photos at once (include an iPhone HEIC), and also drop a PDF, a duplicate photo and a file of about 70 MB
expected: Each photo goes Waiting to upload, then Uploading, then Queued, then Analyzing with a ticking m:ss timer, then Done with its spine count. The PDF and the 70 MB file become failed rows with their copy and are never sent. The duplicate shows the 'already uploaded... no new Claude call' toast and an 'Already uploaded' badge.
result: [pending]

### 3. Stop the server while /upload or /spines is open, then start it again
expected: The last data stays under a 'Couldn't refresh' alert, and the alert clears on the next successful poll. Retry upload works after the restart.
result: [pending]

### 4. Open /spines for real shelf photos (portrait, landscape, and an EXIF-rotated phone JPEG). Also count misreads on fixtures/spike/out/*/compare.html.
expected: Every crop is horizontal, reads left to right, and frames its real spine. Artist, title, format, label, catalog number and raw text sit under it. The misread rate is acceptable, which confirms freeze-master and no tiling.
result: [pending]

### 5. Edit a title on /spines, click away, then reload
expected: The new value persists with an 'Edited' badge and 'Edited · 1' in the card header. Revert restores Claude's read. 'Undo revert' restores the edit. Escape restores the saved value. Typing while a scan polls never makes the text jump.
result: [pending]

### 6. Hover the low-confidence field icon, the density badges (Retake closer / May be incomplete) and the disabled Re-scan trigger
expected: Each tooltip shows its documented copy, for example 'Claude is {pct}% sure of this. Check it against the crop.'
result: [pending]

### 7. Re-scan a photo from /spines and from an error row on /upload
expected: A confirm dialog opens with the quota copy. While it is analyzing, the existing cards stay visible and editable. After it finishes, the merged cards keep their edits and keys. Below 640px the trigger is a 36px icon button, and it is disabled with a tooltip while analyzing.
result: [pending]

### 8. After a re-scan that orphans an edited spine, use Re-attach spine... and Dismiss spine
expected: The orphan shows under 'No longer detected (n)'. Re-attach moves the edits and toasts 'Edits moved to spine #n'. Dismiss toasts and moves focus to the next card's first field, or to the section's Re-scan button.
result: [pending]

### 9. On /spines, use the All / Needs review toggle and the photo Select, then reload. After a re-scan that changed an edited field's read, click 'Use new read'.
expected: Both filters survive a reload, changing the photo scrolls to the top, and the counts match the list. 'Use new read' clears the 'Latest scan reads' hint and the Edited badge.
result: [pending]

### 10. Check the layouts at 360px and 1280px: the CLI-not-ready alert, sticky photo headers with wrapping badges and truncated filenames, the Raw text textarea with 300 characters (grows to 6 rows, then scrolls), the Re-scan, Re-attach and Dismiss dialogs, the filter bar, and error reasons clamped to 3 lines
expected: No overflow at either width. Copy matches UI-SPEC.
result: [pending]

### 11. Render a 20:1 crop and a 4:1 crop, then scroll a list of about 500 spine cards
expected: Both crops render in full (object-contain, max-h-32/min-h-12), and scrolling stays responsive without virtualization.
result: [pending]

### 12. Review the VIS-01 privacy prohibition (judgment tier): 'MUST NOT send a photo, crop or extracted text anywhere except the single local claude -p call per run, and MUST NOT let that call bill an API key'
expected: Owner agrees the only outbound path is runVisionCall (scan-photo.ts:414) with buildClaudeEnv scrubbing API-billing variables, and that the fresh isClaudeReady check before the spawn (scan-photo.ts:391) refuses API-billed logins.
result: [pending]

## Summary

total: 12
passed: 1
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps
