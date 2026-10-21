import 'server-only';

// One pacing gate for every api.discogs.com request (RESEARCH Pattern 2,
// D-05, D-06). Routes and the lease-holding worker share one Node process,
// so a single globalThis instance paces both. Spacing derives from the
// X-Discogs-Ratelimit header (1112 ms at 60/min, 2667 ms at 25/min) and
// doubles when Remaining drops below 10% of the limit. A 429 pauses the
// whole gate.

export type GateClock = {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
};

type HeaderSource = { get(name: string): string | null };

const RETRY_AFTER_MIN_MS = 1_000;
const RETRY_AFTER_MAX_MS = 300_000;

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('aborted', 'AbortError');
}

/** setTimeout-based sleep; unref'd so it never holds the process open. */
function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    timer.unref();
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const realClock: GateClock = { now: () => Date.now(), sleep: realSleep };

/** Request spacing that uses 90% of a per-minute limit. */
export function intervalForLimit(limit: number): number {
  return Math.ceil(60_000 / (limit * 0.9));
}

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function nonNegativeInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Retry-After as milliseconds: integer delta-seconds or an HTTP-date (delta
 * rounded up to whole seconds), clamped to 1-300 s. Null for anything else;
 * the caller then uses 60 000 (D-06).
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (value === null || value === undefined) return null;
  const v = value.trim();
  if (!v) return null;
  let ms: number;
  if (/^\d+$/.test(v)) {
    ms = Number(v) * 1000;
  } else {
    const at = Date.parse(v);
    if (Number.isNaN(at)) return null;
    ms = Math.ceil((at - now) / 1000) * 1000;
  }
  if (!Number.isFinite(ms)) return null;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, ms));
}

export class DiscogsGate {
  nextAt = 0;
  intervalMs = intervalForLimit(60);
  private pausedUntilMs = 0;
  private readonly clock: GateClock;

  constructor(clock: GateClock = realClock) {
    this.clock = clock;
  }

  /** Waits (abortable) for the next slot, then books it. */
  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw abortReason(signal);
      const now = this.clock.now();
      const at = Math.max(this.nextAt, this.pausedUntilMs);
      if (at <= now) {
        this.nextAt = now + this.intervalMs;
        return;
      }
      // Re-check after waking: a pause or another caller may have moved it.
      await this.clock.sleep(at - now, signal);
    }
  }

  /** Re-derives the spacing from the rate-limit headers of a response. */
  observe(headers: HeaderSource): void {
    const limit = positiveInt(headers.get('x-discogs-ratelimit'));
    if (limit === null) return;
    const remaining = nonNegativeInt(
      headers.get('x-discogs-ratelimit-remaining'),
    );
    let interval = intervalForLimit(limit);
    if (remaining !== null && remaining < Math.ceil(limit * 0.1)) {
      interval *= 2;
    }
    this.intervalMs = interval;
  }

  /** Holds every request for at least ms from now. */
  pause(ms: number): void {
    this.pausedUntilMs = Math.max(this.pausedUntilMs, this.clock.now() + ms);
  }

  /** Epoch ms the pause ends, or null when not paused. */
  pausedUntil(): number | null {
    return this.pausedUntilMs > this.clock.now() ? this.pausedUntilMs : null;
  }
}

// One gate per process, shared across module graphs and dev HMR.
const g = globalThis as unknown as { __discogsGate?: DiscogsGate };

export function discogsGate(): DiscogsGate {
  if (!g.__discogsGate) g.__discogsGate = new DiscogsGate();
  return g.__discogsGate;
}

/** Replaces the process gate (tests only); returns the new instance. */
export function resetDiscogsGateForTests(clock?: GateClock): DiscogsGate {
  g.__discogsGate = new DiscogsGate(clock);
  return g.__discogsGate;
}
