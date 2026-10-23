---
status: diagnosed
trigger: "UAT G-02-5: Escape restores the saved value (on an unedited field it cancels the draft without saving) — fails on first edit"
created: 2026-10-20T08:10:00Z
updated: 2026-10-20T08:40:00Z
audit_acknowledged:
  milestone: v1
  at: 2026-10-23
  status: diagnosed
---

## Current Focus

bug_class: Bohrbug (deterministic once the input is blurred before React's onKeyDown runs; environment-dependent trigger)
hypothesis: CONFIRMED — SpineField's Escape cancel depends on the input still being focused when React's onKeyDown runs. When something blurs the input first (window-capture Escape handler, e.g. a keyboard-nav browser extension), onBlur commits the typed draft (skipCommit not armed yet), then onKeyDown resets the draft and arms skipCommit=true with a no-op blur(), leaving the flag stale. The stale flag swallows the NEXT blur: the next Escape then "works", and a normal click-away save is silently dropped.
reasoning_checkpoint:
  hypothesis: "Escape saves the typed draft because focus leaves the input before SpineField.onKeyDown runs; onBlur -> commit() fires with skipCommit=false, then onKeyDown arms skipCommit=true with a blur() that is a no-op, so the flag persists and swallows the following blur."
  confirming_evidence:
    - "Headless Chromium with normal event order (keydown -> focusout): no PATCH, value restored — component correct only in that order."
    - "Same build with a window-capture keydown listener that blurs activeElement on Escape and lets the event through: attempt 1 shows original at 0ms, typed value + Edited at 60ms, PATCH sent (exact user symptom); attempt 2 and 3 restore the previous saved edit (exact user symptom); attempt 4 click-away shows the draft but no PATCH is sent and reload shows the old value (stale flag swallows a real save)."
  falsification_test: "If the user's browser delivered keydown(Escape) to the input while it was still focused, onBlur would see skipCommit=true and no PATCH would be sent; the alternating save/restore pattern could not occur."
  fix_rationale: "Make Escape cancellation independent of who blurs first and never leave a persistent skip flag: defer the blur commit to a macrotask so a same-dispatch Escape can cancel it, and/or clear skipCommit on focus."
  blind_spots: "Did not identify the exact extension/browser in the owner's environment (did not inspect browser profiles). Did not test Firefox/WebKit engines (only Chromium installed)."
  candidate_causes:
    - "environment: browser extension or browser behavior blurs the focused input on Escape in window capture phase (Vimium-C/Surfingkeys/Tridactyl-style) before React's root listener"
    - "code: skipCommit 'skip next blur' flag is armed unconditionally and blur() may be a no-op, so the flag goes stale; commit is synchronous in onBlur so a pre-keydown blur saves irrevocably"
  and_gate: "yes — the symptom needs both the external pre-keydown blur (environment) AND the code's order-dependent skip-next-blur flag; with either removed, Escape behaves."

## Symptoms

expected: On /spines, typing in a spine field and pressing Escape restores the saved value and does NOT save the draft.
actual: On a field with no prior edit, Escape briefly reverts the input, then the typed draft reappears and gets saved (Edited badge appears). On a field already edited, Escape correctly restores the previous saved edit.
errors: None reported
reproduction: Test 5 in .planning/phases/02-shelf-scan/02-UAT.md — next start, /spines, unedited field, type extra characters, press Escape.
started: Discovered during UAT

## Eliminated

- hypothesis: App-level global Escape/blur handler intercepts the key
  evidence: grep finds Escape handling only in spine-field.tsx and secret-field.tsx; no document/window keydown or activeElement.blur in src.
  timestamp: 2026-10-20T08:13:00Z
- hypothesis: Escape handler itself (or React nested blur dispatch) saves the draft on unedited fields; revert/undo-revert leaves bad state
  evidence: Playwright headless Chromium on prod build — plain label/title, edit->revert->type->Esc, edit->revert->undo->type->Esc all produce zero PATCH after Escape and restore the value.
  timestamp: 2026-10-20T08:25:00Z

## Evidence

- timestamp: 2026-10-20T08:12:00Z
  checked: src/components/spine-field.tsx onKeyDown/onBlur/commit
  found: Escape sets draft=f.value, dirty=false, skipCommit.current=true, then e.currentTarget.blur(); onBlur consumes skipCommit and returns. Only save paths are commit() (onBlur), takeNewRead, and Undo revert toast action.
  implication: The save must come from a blur that reaches onBlur before skipCommit is armed.
- timestamp: 2026-10-20T08:13:00Z
  checked: grep for keydown/Escape/blur()/activeElement across src
  found: Only spine-field.tsx and secret-field.tsx handle Escape; no global keydown/blur handler in app code.
  implication: No app-level Escape interceptor.
- timestamp: 2026-10-20T08:25:00Z
  checked: Playwright headless Chromium against isolated `next start` on :3011 (DATA_DIR=scratchpad copy), scenarios plain (label, title), edit->revert->type->Esc, edit->revert->undo->type->Esc
  found: All scenarios behave correctly — keydown(Escape) then focusout, zero PATCH after Escape.
  implication: Component is correct only when the input is still focused when React's onKeyDown runs.
- timestamp: 2026-10-20T08:35:00Z
  checked: Same harness plus an init script adding window.addEventListener('keydown', Escape -> document.activeElement.blur(), {capture:true}) without stopping propagation; three type+Escape attempts then a type+click-away
  found: |
    attempt 1: focusout precedes React keydown; PATCH {"title":"...AAA"}; samples 0ms "Brave And Crazy"|E0, 60ms "Brave And CrazyAAA"|E1 (momentary revert, then typed value + Edited) — matches user report exactly.
    attempt 2/3: no PATCH; value restored to "...AAA" (previous saved edit) — matches "goes back to what the previous mutation was".
    attempt 4 (type DDD, click away): no PATCH sent; UI shows "...AAADDD" but reload shows "...AAA" — the stale skipCommit flag swallowed a legitimate save.
  implication: Root cause confirmed. Mechanism is order-dependent skip-next-blur flag; there is also a silent data-loss path (click-away save dropped) once the flag is stale.

## Resolution

root_cause: "SpineField's Escape cancel (src/components/spine-field.tsx:236-260) assumes the input is still focused when onKeyDown runs. If focus is lost first (e.g. a browser extension's window-capture Escape handler blurs activeElement and lets the event through), onBlur runs commit() and saves the typed draft because skipCommit is not yet set; onKeyDown then resets the draft (the momentary revert) and sets skipCommit=true, but its e.currentTarget.blur() is a no-op on an already-blurred element, so the flag is never consumed. The stale flag swallows the next blur: the next Escape appears to work, and a normal click-away save is silently dropped."
fix:
verification:
files_changed: []
