---
phase: 02-shelf-scan
reviewed: 2026-10-20T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/components/photo-status-list.tsx
  - src/components/spine-field.tsx
  - src/components/spines-view.tsx
  - src/lib/field-commit.test.ts
  - src/lib/field-commit.ts
  - src/lib/photo-polling.test.ts
  - src/lib/photo-status.test.ts
  - src/lib/photo-status.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-10-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This is an incremental review of gap-closure plans 02-13 (poll retry after a failed poll, G-02-3) and 02-14 (Escape-safe deferred field commit with flush on unmount, G-02-5). The scope is `git diff be95c005 HEAD` for the listed files.

What checks out:
- `photosRefetchInterval` correctly keys off `q.state.status`. TanStack v5 keeps `status: 'error'` (with the old data) after a failed refetch, so the 3 s retry engages and clears on success.
- The `optimistic()` unedited rule now matches the server's `fieldUnedited` SQL. That includes the case of whitespace-only `aiValue` with a `null` value.
- `createFieldCommit` handles both event orders for Escape correctly.

The defects are in the new deferred-commit design. A save fired from the unmount flush has no way to report failure. The case the comment names as motivation (a re-scan merge removing the card) is exactly the case where the PATCH fails. Deferring the commit also opens a new window in which a blur-triggered save can be lost on tab hide or close.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: A save sent by the unmount flush fails silently, so the edit is lost

**File:** `src/components/spine-field.tsx:131` (with `save()` at 173-193 and the hook-level `onError` at 150-153)
**Issue:** `useEffect(() => () => fieldCommit.flush(), [fieldCommit])` runs `commit()`, which calls `save()`, which calls `mutation.mutate(body, { onSuccess, onError })` after the component has unmounted. In @tanstack/query-core 5.104.2, `MutationObserver#notify` only runs per-call callbacks `if (mutateOptions && this.hasListeners())` (mutationObserver.js:157-158). After unmount the observer has no listeners, so the per-call `onError` never runs. Only the hook-level `onError` runs, and it silently rolls the cache back. There is no toast and no error state, and the draft is gone along with the component.

The comment names "re-scan merge" as the motivating case, and that is the case where this fails. A field whose draft has not been saved yet is still unedited in the DB. `merge.ts:192` marks an unmatched unedited spine `superseded`, so `updateSpineField` matches no row (`EDITABLE` excludes superseded) and the route returns `not_editable`. The edit is dropped with no feedback, which contradicts the "sent, not dropped" claim (D-08).
**Fix:** Report failure through a path that does not depend on the observer having listeners. For example, use `mutateAsync` in the flush path and toast on rejection:
```tsx
useEffect(
  () => () =>
    fieldCommit.flush(), // commit -> saveDetached below when unmounting
  [fieldCommit],
);

function saveDetached(value: string | null) {
  mutation
    .mutateAsync({ field: f.field, value })
    .catch((err) => toast.error(`${label} ${saveError(err)}`));
}
```
Alternatively, set an `unmountedRef` in the cleanup and have the hook-level `onError` raise a toast when it is set. Also add a component test that unmounts with a pending blur and a failing PATCH.

### WR-02: The deferred commit has no flush on page hide or unload, so a blur-triggered save can be lost

**File:** `src/lib/field-commit.ts:28-36`, `src/components/spine-field.tsx:243-246`
**Issue:** Before 02-14, `onBlur` sent the PATCH synchronously. Now it schedules `setTimeout(commit, 0)`. When the blur comes from the page being hidden (switching tabs, minimizing, Cmd+W after the blur), browsers throttle timers in hidden documents to about 1 s or more. Nothing flushes the pending commit on `pagehide` or `visibilitychange`, and `flush()` only runs on React unmount, which never happens on unload. If the page is then closed or navigated away inside the throttle window, an edit the user has already "left" is never sent. That is a new loss path the synchronous version did not have.
**Fix:** Flush on hide as well as on unmount:
```tsx
useEffect(() => {
  const onHide = () => {
    if (document.visibilityState === 'hidden') fieldCommit.flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', fieldCommit.flush);
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', fieldCommit.flush);
    fieldCommit.flush();
  };
}, [fieldCommit]);
```
Flushing on `visibilitychange: hidden` does not conflict with Escape. Escape cannot arrive in the same task as a visibility change.

## Info

### IN-01: `isPending()` is exported API used only by tests

**File:** `src/lib/field-commit.ts:51-53`
**Issue:** No production caller uses it (`grep isPending()` only finds the definition and tests). The controller surface is wider than the component needs.
**Fix:** Remove it, or mark it as test-only in the doc comment.

### IN-02: The G-02-5 fix in SpineField is untested; only the pure controller is

**File:** `src/lib/field-commit.test.ts:10-51`
**Issue:** The tests drive `createFieldCommit` through a hand-written fake whose `input.blur()` calls `onBlur` synchronously only while focused. The regression actually lived in SpineField's event wiring: React dispatching `focusout` synchronously from `input.blur()` inside a keydown handler, and `useEffect` cleanup ordering versus the `useMutation` observer unsubscribing. Neither is exercised, so a change to the wiring in `spine-field.tsx:237-267` or `:131` would not fail any test. WR-01 is an example of a defect the fake cannot see.
**Fix:** Add a React Testing Library test for `SpineField` covering Escape after an external blur, click-away after Escape, and unmount with a pending blur.

### IN-03: The polling recovery test does not match the production retry configuration

**File:** `src/lib/photo-polling.test.ts:36-38`
**Issue:** The test client uses `retry: false`. The app's `QueryClient` (`src/app/providers.tsx:11-13`) keeps the default `retry: 3` with exponential backoff. In production the "Couldn't refresh" alert appears only after about 7 s of retries, and each 3 s interval refetch from the error state runs its own retry chain. The test proves the interval logic but not the behaviour users see, which the alert copy describes as "retrying every few seconds".
**Fix:** Add one case that uses the real default options, or document why `retry: false` stands in for them.

### IN-04: The PhotoStatusList doc comment is stale

**File:** `src/components/photo-status-list.tsx:21-24`
**Issue:** It still says polling happens "every 1.5 s while any photo is active". It does not mention the `POLL_RETRY_MS` retry after a failed poll that the alert copy at line 52-53 now relies on.
**Fix:** Mention the 3 s retry while the last poll failed.

---

_Reviewed: 2026-10-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
