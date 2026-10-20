/**
 * Per-field blur commit that Escape can cancel whichever event arrives first
 * (G-02-5, D-08). Pure and client-safe: no React import.
 *
 * Replaces SpineField's skip-next-blur flag. That flag assumed the input was
 * still focused when the Escape keydown ran. When something blurred the field
 * first (for example a browser extension's capture-phase Escape handler),
 * onBlur saved the draft before the reset, and the Escape's own blur() was a
 * no-op, so the flag stayed armed and silently swallowed the next click-away
 * save.
 *
 * Here a blur only schedules the commit for after the current task, so an
 * Escape in the same dispatch can still cancel it, and escape() leaves nothing
 * armed afterwards. State lives in the closure, so each field has its own.
 */
export function createFieldCommit() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  }

  return {
    /** Field lost focus: commit after the current task unless cancelled. */
    blur(commit: () => void) {
      cancel();
      pending = commit;
      timer = setTimeout(() => {
        timer = null;
        pending = null;
        commit();
      }, 0);
    },
    /**
     * Escape: blur the input (schedules a commit when it was still focused,
     * a no-op when focus already left), then drop any pending commit and
     * restore the saved value.
     */
    escape(blurInput: () => void, reset: () => void) {
      blurInput();
      cancel();
      reset();
    },
    /** Refocused in the same task as a blur: the draft stays dirty instead. */
    focus() {
      cancel();
    },
    isPending() {
      return timer !== null;
    },
    /**
     * Field unmounting: send a pending commit now, once, so a card removed
     * in the same task as its blur (filter change, re-scan merge) still saves.
     */
    flush() {
      const commit = pending;
      cancel();
      commit?.();
    },
  };
}
