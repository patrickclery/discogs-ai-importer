---
status: diagnosed
phase: 02-shelf-scan
source: [02-VERIFICATION.md]
started: 2026-10-20T05:55:08.198Z
updated: 2026-10-20T08:05:33.761Z
---

## Current Test

[testing complete]

## Tests

### 1. Run the end-to-end fake-CLI proofs after the review fixes: node scripts/verify-scan.ts, node scripts/verify-scan-recovery.ts, node scripts/verify-rescan.ts
expected: Each one ends with its OK line. verify-scan-recovery shows exactly one -p invocation after the kill -9.
result: pass (orchestrator ran all three scripts after the review fixes: each printed its OK line)

### 2. On /upload, drag several real shelf photos at once (include an iPhone HEIC), and also drop a PDF, a duplicate photo and a file of about 70 MB
expected: Each photo goes Waiting to upload, then Uploading, then Queued, then Analyzing with a ticking m:ss timer, then Done with its spine count. The PDF and the 70 MB file become failed rows with their copy and are never sent. The duplicate shows the 'already uploaded... no new Claude call' toast and an 'Already uploaded' badge.
result: pass

### 3. Stop the server while /upload or /spines is open, then start it again
expected: The last data stays under a 'Couldn't refresh' alert, and the alert clears on the next successful poll. Retry upload works after the restart.
result: issue
reported: "Alert appeared with last data kept (prod build; dev HMR reloads the page instead). After restarting the server: it's not changing — the Couldn't refresh alert never clears even though it says retrying every few seconds (all photos Done, so polling appears stopped)."
severity: major

### 4. Open /spines for real shelf photos (portrait, landscape, and an EXIF-rotated phone JPEG). Also count misreads on fixtures/spike/out/*/compare.html.
expected: Every crop is horizontal, reads left to right, and frames its real spine. Artist, title, format, label, catalog number and raw text sit under it. The misread rate is acceptable, which confirms freeze-master and no tiling.
result: pass

### 5. Edit a title on /spines, click away, then reload
expected: The new value persists with an 'Edited' badge and 'Edited · 1' in the card header. Revert restores Claude's read. 'Undo revert' restores the edit. Escape restores the saved value. Typing while a scan polls never makes the text jump.
result: issue
reported: "Persistence after reload works (Edited badge, Edited · 1). The undo revert has an odd behavior. When I first type it and hit escape, it momentarily changes back, then changes to the mutated version, then the edited button shows up. But if I click on it again and type, then hit escape, it goes back to what the previous mutation was."
severity: major

### 6. Hover the low-confidence field icon, the density badges (Retake closer / May be incomplete) and the disabled Re-scan trigger
expected: Each tooltip shows its documented copy, for example 'Claude is {pct}% sure of this. Check it against the crop.'
result: pass

### 7. Re-scan a photo from /spines and from an error row on /upload
expected: A confirm dialog opens with the quota copy. While it is analyzing, the existing cards stay visible and editable. After it finishes, the merged cards keep their edits and keys. Below 640px the trigger is a 36px icon button, and it is disabled with a tooltip while analyzing.
result: pass
note: "Confirm dialog quota copy and edit-during-rescan merge verified on /spines. Below-640px icon trigger and re-scan from an /upload error row not exercised (no failed photo available)."

### 8. After a re-scan that orphans an edited spine, use Re-attach spine... and Dismiss spine
expected: The orphan shows under 'No longer detected (n)'. Re-attach moves the edits and toasts 'Edits moved to spine #n'. Dismiss toasts and moves focus to the next card's first field, or to the section's Re-scan button.
result: skipped
reason: "No orphaned edited spine after the re-scan, so the No longer detected section never appeared."

### 9. On /spines, use the All / Needs review toggle and the photo Select, then reload. After a re-scan that changed an edited field's read, click 'Use new read'.
expected: Both filters survive a reload, changing the photo scrolls to the top, and the counts match the list. 'Use new read' clears the 'Latest scan reads' hint and the Edited badge.
result: pass
note: "Both filters persist in the URL (?photo=...&review=1) and the counts match. Scroll-to-top on photo change is moot because the filter bar is only reachable at the top. Use new read not exercised (no changed re-read of an edited field)."

### 10. Check the layouts at 360px and 1280px: the CLI-not-ready alert, sticky photo headers with wrapping badges and truncated filenames, the Raw text textarea with 300 characters (grows to 6 rows, then scrolls), the Re-scan, Re-attach and Dismiss dialogs, the filter bar, and error reasons clamped to 3 lines
expected: No overflow at either width. Copy matches UI-SPEC.
result: pass

### 11. Render a 20:1 crop and a 4:1 crop, then scroll a list of about 500 spine cards
expected: Both crops render in full (object-contain, max-h-32/min-h-12), and scrolling stays responsive without virtualization.
result: skipped
reason: "Skipped by user (crop aspect-ratio extremes and 500-card scroll not checked)."

### 12. Review the VIS-01 privacy prohibition (judgment tier): 'MUST NOT send a photo, crop or extracted text anywhere except the single local claude -p call per run, and MUST NOT let that call bill an API key'
expected: Owner agrees the only outbound path is runVisionCall (scan-photo.ts:414) with buildClaudeEnv scrubbing API-billing variables, and that the fresh isClaudeReady check before the spawn (scan-photo.ts:391) refuses API-billed logins.
result: pass

## Summary

total: 12
passed: 8
issues: 2
pending: 0
skipped: 2
blocked: 0

## Deferred Follow-Ups

- test: 4
  idea: "it's good, but is it possible that it can rotate the spine to be perfectly horizontal ? (crops of tilted spines are axis-aligned, so they sit at a slant and neighbouring spines bleed in; crop.ts only rotates in 90-degree steps)"
  deferred_at: 2026-10-20
- test: 9
  idea: "I can't change the image from here to make it scroll to the top. I have to scroll to the top first to get to the drop down. (filter bar / photo Select is not sticky, so it is unreachable once scrolled into a long list)"
  deferred_at: 2026-10-20

## Gaps

- gap_id: G-02-3
  truth: "The last data stays under a 'Couldn't refresh' alert, and the alert clears on the next successful poll."
  status: failed
  reason: "User reported: it's not changing — after the server restarted, the Couldn't refresh alert stayed up despite saying 'retrying every few seconds' (all photos Done)."
  severity: major
  test: 3
  root_cause: "photosRefetchInterval decides polling from the last data only and ignores query error state: with every photo Done it returns false, so after a failed refetch nothing reschedules a fetch and isError never resets. Spec gap: 02-UI-SPEC.md:183 mandates false when idle while :358 copy promises 'retrying every few seconds'."
  artifacts:
    - path: "src/lib/photo-status.ts"
      issue: "photosRefetchInterval (lines 94-98) ignores error state"
    - path: "src/components/photo-status-list.tsx"
      issue: "/upload query (line 40) passes only q.state.data?.photos"
    - path: "src/components/spines-view.tsx"
      issue: "/spines query (line 160) has the same pattern"
    - path: ".planning/phases/02-shelf-scan/02-UI-SPEC.md"
      issue: "line 183 contradicts the alert copy at line 358"
  missing:
    - "Return a retry interval (a few seconds) from the refetch interval whenever query status is error, at both call sites"
    - "Unit test for the error-with-idle-data case"
    - "Update UI-SPEC line 183 to match"
  debug_session: .planning/debug/couldnt-refresh-alert-never-clears.md

- gap_id: G-02-5
  truth: "Escape restores the saved value (on an unedited field it cancels the draft without saving)."
  status: failed
  reason: "User reported: When I first type it and hit escape, it momentarily changes back, then changes to the mutated version, then the edited button shows up. But if I click on it again and type, then hit escape, it goes back to what the previous mutation was."
  severity: major
  test: 5
  root_cause: "SpineField's Escape cancel assumes the input is still focused when onKeyDown runs. If focus leaves first (e.g. a browser extension that blurs on Escape), onBlur commits the draft before the reset, and onKeyDown then sets skipCommit=true with no blur to consume it — the stale flag swallows the next blur, so a later click-away save is silently dropped (data loss: field shows new text, server keeps old value)."
  artifacts:
    - path: "src/components/spine-field.tsx"
      issue: "onBlur commits immediately; onKeyDown (lines 125, 236-260) sets skipCommit without guaranteeing a following blur, leaving a stale flag"
  missing:
    - "Defer the blur commit with setTimeout(0) held in a ref; Escape cancels the pending commit and resets the draft"
    - "Clear any leftover skip state on focus"
    - "Regression test: blur-before-Escape ordering — first Escape on unedited field, second Escape, and a normal click-away save after an Escape"
  debug_session: .planning/debug/escape-saves-draft-on-first-edit.md
