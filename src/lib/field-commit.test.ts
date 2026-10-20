import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFieldCommit } from './field-commit';

/**
 * A fake spine field wired the way SpineField wires its controller. The
 * input's blur() only does something while focused, like the DOM, so a
 * second blur (or the Escape handler's blur after focus already left) is a
 * no-op.
 */
function field(saved = 'Brave And Crazy') {
  const ctl = createFieldCommit();
  const saves: string[] = [];
  const s = { saved, draft: saved, focused: false };

  const commit = () => {
    if (s.draft !== s.saved) saves.push(s.draft);
  };
  const reset = () => {
    s.draft = s.saved;
  };
  const onBlur = () => {
    s.focused = false;
    ctl.blur(commit);
  };
  const input = {
    blur: () => {
      if (s.focused) onBlur();
    },
  };

  return {
    ctl,
    saves,
    state: s,
    focus: () => {
      s.focused = true;
      ctl.focus();
    },
    type: (text: string) => {
      s.draft += text;
    },
    /** A capture-phase listener blurs the field before React's keydown. */
    externalBlur: () => input.blur(),
    /** Click elsewhere on the page. */
    clickAway: () => input.blur(),
    /** SpineField's Escape branch of onKeyDown. */
    escape: () => ctl.escape(() => input.blur(), reset),
    /** Enter in an Input (or Ctrl/Cmd+Enter in Raw text). */
    enter: () => input.blur(),
  };
}

/** Every value the field saved, in order (one line, so reports stay flat). */
function saved(f: { saves: string[] }): string {
  return f.saves.join(' | ');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createFieldCommit: Escape (G-02-5)', () => {
  it('keydown-first: Escape restores the saved value and saves nothing', () => {
    const f = field();
    f.focus();
    f.type('AAA');
    f.escape();
    vi.runAllTimers();
    expect(saved(f)).toBe('');
    expect(f.state.draft).toBe(f.state.saved);
    expect(f.ctl.isPending()).toBe(false);
  });

  it('blur-first: Escape after an external blur saves nothing (attempt 1)', () => {
    const f = field();
    f.focus();
    f.type('AAA');
    f.externalBlur();
    f.escape();
    vi.runAllTimers();
    expect(saved(f)).toBe('');
    expect(f.state.draft).toBe(f.state.saved);
  });

  it('blur-first: a second Escape also saves nothing (attempts 2-3)', () => {
    const f = field();
    f.focus();
    f.type('AAA');
    f.externalBlur();
    f.escape();
    vi.runAllTimers();

    f.focus();
    f.type('BBB');
    f.externalBlur();
    f.escape();
    vi.runAllTimers();

    expect(saved(f)).toBe('');
    expect(f.state.draft).toBe(f.state.saved);
  });

  it('blur-first: a click-away after an Escape saves the typed value (attempt 4)', () => {
    const f = field();
    f.focus();
    f.type('AAA');
    f.externalBlur();
    f.escape();
    vi.runAllTimers();

    f.focus();
    f.type('DDD');
    f.clickAway();
    vi.runAllTimers();

    expect(saved(f)).toBe('Brave And CrazyDDD');
  });

  it('keydown-first: a click-away after an Escape saves the typed value', () => {
    const f = field();
    f.focus();
    f.type('AAA');
    f.escape();
    vi.runAllTimers();

    f.focus();
    f.type('DDD');
    f.clickAway();
    vi.runAllTimers();

    expect(saved(f)).toBe('Brave And CrazyDDD');
  });
});

describe('createFieldCommit: saving on blur (D-08)', () => {
  it('a plain click-away saves once, after the current task', () => {
    const f = field();
    f.focus();
    f.type('XYZ');
    f.clickAway();
    expect(saved(f)).toBe('');
    expect(f.ctl.isPending()).toBe(true);
    vi.runAllTimers();
    expect(saved(f)).toBe('Brave And CrazyXYZ');
    expect(f.ctl.isPending()).toBe(false);
  });

  it('Enter saves once through the same deferred path', () => {
    const f = field();
    f.focus();
    f.type('!');
    f.enter();
    vi.runAllTimers();
    expect(saved(f)).toBe('Brave And Crazy!');
  });

  it('focus right after a blur drops the pending commit; the next blur saves once', () => {
    const f = field();
    f.focus();
    f.type('A');
    f.clickAway();
    f.focus();
    expect(f.ctl.isPending()).toBe(false);
    vi.runAllTimers();
    expect(saved(f)).toBe('');

    f.type('B');
    f.clickAway();
    vi.runAllTimers();
    expect(saved(f)).toBe('Brave And CrazyAB');
  });

  it('each field gets its own controller', () => {
    const a = field();
    const b = field();
    a.focus();
    a.type('1');
    a.clickAway();
    b.focus();
    b.type('2');
    b.escape();
    vi.runAllTimers();
    expect(saved(a)).toBe('Brave And Crazy1');
    expect(saved(b)).toBe('');
  });
});

describe('createFieldCommit: flush on unmount (D-08)', () => {
  it('flush after a blur saves once, synchronously, and leaves nothing pending', () => {
    const f = field();
    f.focus();
    f.type('Z');
    f.clickAway();
    f.ctl.flush();
    expect(saved(f)).toBe('Brave And CrazyZ');
    expect(f.ctl.isPending()).toBe(false);
    vi.runAllTimers();
    expect(saved(f)).toBe('Brave And CrazyZ');
  });

  it('flush with nothing pending does nothing', () => {
    const f = field();
    f.ctl.flush();
    f.focus();
    f.type('Z');
    f.ctl.flush();
    vi.runAllTimers();
    expect(saved(f)).toBe('');
  });

  it('two blurs before timers run save once, with the draft current when it fires', () => {
    const f = field();
    f.focus();
    f.type('1');
    f.clickAway();
    f.state.focused = true;
    f.type('2');
    f.clickAway();
    vi.runAllTimers();
    expect(saved(f)).toBe('Brave And Crazy12');
  });

  it('escape after flush still resets and saves nothing more', () => {
    const f = field();
    f.focus();
    f.type('Z');
    f.clickAway();
    f.ctl.flush();
    f.focus();
    f.type('Q');
    f.escape();
    vi.runAllTimers();
    expect(saved(f)).toBe('Brave And CrazyZ');
    expect(f.state.draft).toBe(f.state.saved);
  });
});
