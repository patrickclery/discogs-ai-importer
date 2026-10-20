/**
 * RED skeleton: reproduces SpineField's current skip-next-blur behaviour
 * (G-02-5) so the ordering tests fail on their assertions. Replaced in GREEN.
 */
export function createFieldCommit() {
  let skip = false;
  return {
    blur(commit: () => void) {
      if (skip) {
        skip = false;
        return;
      }
      commit();
    },
    escape(blurInput: () => void, reset: () => void) {
      reset();
      skip = true;
      blurInput();
    },
    focus() {},
    isPending() {
      return false;
    },
  };
}
