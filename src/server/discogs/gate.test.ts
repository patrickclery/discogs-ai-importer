import { afterEach, describe, expect, it } from 'vitest';
import {
  DiscogsGate,
  discogsGate,
  intervalForLimit,
  parseRetryAfter,
  resetDiscogsGateForTests,
} from './gate';

// The pacing gate pinned at and around each threshold (D-05, D-06). Every
// test runs on a fake clock that records its sleeps: no real waiting.

const START = 1_800_000_000_000;

function fakeClock() {
  const clock = {
    t: START,
    sleeps: [] as number[],
    now: () => clock.t,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw signal.reason;
      clock.sleeps.push(ms);
      clock.t += ms;
    },
  };
  return clock;
}

function headers(h: Record<string, string>) {
  const map = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

function rate(limit: string, remaining?: string) {
  return headers({
    'X-Discogs-Ratelimit': limit,
    ...(remaining === undefined
      ? {}
      : { 'X-Discogs-Ratelimit-Remaining': remaining }),
  });
}

afterEach(() => {
  resetDiscogsGateForTests();
});

describe('intervalForLimit (D-05: 90% of the per-minute limit, rounded up)', () => {
  it('60 per minute gives 1112 ms', () => {
    expect(intervalForLimit(60)).toBe(1112);
  });

  it('25 per minute gives 2667 ms', () => {
    expect(intervalForLimit(25)).toBe(2667);
  });

  it('a new gate starts at the 60 per minute interval', () => {
    expect(new DiscogsGate(fakeClock()).intervalMs).toBe(1112);
  });
});

describe('observe (rate-limit headers)', () => {
  it('remaining 6 of 60 (exactly ceil(60 x 0.1)) keeps 1112 ms', () => {
    const gate = new DiscogsGate(fakeClock());
    gate.observe(rate('60', '6'));
    expect(gate.intervalMs).toBe(1112);
  });

  it('remaining 5 of 60 doubles the interval to 2224 ms', () => {
    const gate = new DiscogsGate(fakeClock());
    gate.observe(rate('60', '5'));
    expect(gate.intervalMs).toBe(2224);
  });

  it('a limit of 25 re-derives the interval to 2667 ms', () => {
    const gate = new DiscogsGate(fakeClock());
    gate.observe(rate('25', '20'));
    expect(gate.intervalMs).toBe(2667);
  });

  it.each(['0', '-3', 'abc', '', '1.5'])(
    'a limit header of %j is ignored and the current interval stays',
    (limit) => {
      const gate = new DiscogsGate(fakeClock());
      gate.observe(rate('25', '20'));
      gate.observe(rate(limit, '0'));
      expect(gate.intervalMs).toBe(2667);
    },
  );

  it('a response with no rate-limit headers keeps the interval and never slows down', () => {
    const gate = new DiscogsGate(fakeClock());
    gate.observe(rate('25', '20'));
    gate.observe(headers({}));
    expect(gate.intervalMs).toBe(2667);
    gate.observe(headers({ 'X-Discogs-Ratelimit-Remaining': '0' }));
    expect(gate.intervalMs).toBe(2667);
  });

  it('a limit with no remaining header uses the plain interval', () => {
    const gate = new DiscogsGate(fakeClock());
    gate.observe(rate('60', '1'));
    expect(gate.intervalMs).toBe(2224);
    gate.observe(rate('60'));
    expect(gate.intervalMs).toBe(1112);
  });
});

describe('acquire (pacing and pause adjacency)', () => {
  it('the first acquire proceeds at once and books the next slot one interval later', async () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    await gate.acquire();
    expect(clock.sleeps).toEqual([]);
    expect(gate.nextAt).toBe(START + 1112);
  });

  it('at exactly the ready time it does not wait', async () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    await gate.acquire();
    clock.t = gate.nextAt;
    await gate.acquire();
    expect(clock.sleeps).toEqual([]);
  });

  it('1 ms before the ready time it waits exactly 1 ms', async () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    await gate.acquire();
    clock.t = gate.nextAt - 1;
    await gate.acquire();
    expect(clock.sleeps).toEqual([1]);
  });

  it('the ready time is max(nextAt, pausedUntil): at the pause end no wait, 1 ms before it 1 ms', async () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    await gate.acquire(); // nextAt = START + 1112
    gate.pause(5000); // pausedUntil = START + 5000
    clock.t = START + 5000;
    await gate.acquire();
    expect(clock.sleeps).toEqual([]);

    gate.pause(5000); // pausedUntil = START + 10000
    clock.t = START + 9999;
    await gate.acquire();
    expect(clock.sleeps).toEqual([1]);
  });

  it('an aborted signal rejects acquire without booking a slot', async () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    const ac = new AbortController();
    ac.abort(new Error('stop'));
    await expect(gate.acquire(ac.signal)).rejects.toThrow('stop');
    expect(gate.nextAt).toBe(0);
  });

  it('an abort during the wait rejects acquire', async () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    await gate.acquire();
    const ac = new AbortController();
    clock.sleep = async () => {
      ac.abort(new Error('lease lost'));
      throw ac.signal.reason;
    };
    await expect(gate.acquire(ac.signal)).rejects.toThrow('lease lost');
  });
});

describe('pause and pausedUntil', () => {
  it('a second, shorter pause never shortens an active pause', () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    gate.pause(10_000);
    gate.pause(5000);
    expect(gate.pausedUntil()).toBe(START + 10_000);
  });

  it('a later pause extends it', () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    gate.pause(5000);
    clock.t += 4000;
    gate.pause(5000);
    expect(gate.pausedUntil()).toBe(START + 9000);
  });

  it('pausedUntil is null before any pause and once the pause is in the past', () => {
    const clock = fakeClock();
    const gate = new DiscogsGate(clock);
    expect(gate.pausedUntil()).toBeNull();
    gate.pause(1000);
    clock.t = START + 999;
    expect(gate.pausedUntil()).toBe(START + 1000);
    clock.t = START + 1000;
    expect(gate.pausedUntil()).toBeNull();
  });

  it('discogsGate() is one shared instance until reset', () => {
    const a = discogsGate();
    expect(discogsGate()).toBe(a);
    const b = resetDiscogsGateForTests(fakeClock());
    expect(discogsGate()).toBe(b);
    expect(b).not.toBe(a);
  });
});

describe('parseRetryAfter (D-06: 1-300 s, else the caller uses 60 s)', () => {
  const DATE = 'Wed, 21 Oct 2026 07:28:00 GMT';
  const AT = Date.parse(DATE);

  it.each([
    ['7', 7000],
    ['0', 1000],
    ['1', 1000],
    ['300', 300_000],
    ['301', 300_000],
    [' 7 ', 7000],
  ])('delta-seconds %j gives %i ms', (value, ms) => {
    expect(parseRetryAfter(value, START)).toBe(ms);
  });

  it('an HTTP-date 2.2 s ahead rounds up to 3000 ms', () => {
    expect(parseRetryAfter(DATE, AT - 2200)).toBe(3000);
  });

  it('an HTTP-date exactly 2 s ahead gives 2000 ms', () => {
    expect(parseRetryAfter(DATE, AT - 2000)).toBe(2000);
  });

  it('an HTTP-date in the past clamps to 1000 ms and one far ahead to 300 000 ms', () => {
    expect(parseRetryAfter(DATE, AT + 60_000)).toBe(1000);
    expect(parseRetryAfter(DATE, AT - 3_600_000)).toBe(300_000);
  });

  it('the obsolete RFC 850 and asctime HTTP-date forms parse too', () => {
    expect(
      parseRetryAfter('Wednesday, 21-Oct-26 07:28:00 GMT', AT - 2000),
    ).toBe(2000);
    expect(parseRetryAfter('Wed Oct 21 07:28:00 2026', AT - 2000)).toBe(2000);
  });

  it.each(['1.5', '', '   ', 'soon', '-3', '7s', '2026-10-21'])(
    '%j gives null',
    (value) => {
      expect(parseRetryAfter(value, START)).toBeNull();
    },
  );

  it('null and undefined give null', () => {
    expect(parseRetryAfter(null, START)).toBeNull();
    expect(parseRetryAfter(undefined, START)).toBeNull();
  });
});
