import 'server-only';
import { LOGIN_HINT } from '../claude/cli';
import type { RunResult } from '../proc/run';
import { VISION_MAX_BUFFER } from './run';
import { CliEnvelope, type FieldRead, VisionResult } from './schema';

// Classification of one recorded vision run (RESEARCH Pattern 4 step 6).
// First match wins. Never throws: every outcome is ok or a typed error.

export const VISION_ERROR_KINDS = [
  'cli_unavailable',
  'timeout',
  'interrupted',
  'truncated',
  'refused',
  'schema_invalid',
  'failed',
] as const;
export type VisionErrorKind = (typeof VISION_ERROR_KINDS)[number];

export type VisionOutcome =
  | { ok: true; result: VisionResult; envelope: CliEnvelope }
  | {
      ok: false;
      kind: VisionErrorKind;
      detail: string;
      envelope?: CliEnvelope;
    };

const DETAIL_MAX = 160;

function cut(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > DETAIL_MAX ? t.slice(0, DETAIL_MAX) : t;
}

function firstLine(s: string): string {
  return cut(s.split('\n').find((l) => l.trim()) ?? '');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
}

/**
 * null, '' and whitespace-only become null; any other value is kept exactly
 * as returned (no trim, no case change). Confidence is clamped to [0, 1].
 */
function normalizeField(f: FieldRead): FieldRead {
  const value = f.value?.trim() ? f.value : null;
  const confidence = Number.isFinite(f.confidence)
    ? Math.min(1, Math.max(0, f.confidence))
    : 0;
  return { value, confidence };
}

const FIELD_KEYS = [
  'raw_text',
  'artist',
  'title',
  'format',
  'label',
  'catalog_number',
] as const;

/**
 * A non-number confidence (NaN, a string, null) becomes 0 before validation,
 * so one odd confidence does not reject the whole photo.
 */
function sanitizeConfidences(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const spines = (raw as { spines?: unknown }).spines;
  if (!Array.isArray(spines)) return raw;
  return {
    ...raw,
    spines: spines.map((s) => {
      if (!s || typeof s !== 'object') return s;
      const out: Record<string, unknown> = { ...s };
      for (const k of FIELD_KEYS) {
        const f = out[k];
        if (f && typeof f === 'object' && 'confidence' in f) {
          const c = (f as { confidence: unknown }).confidence;
          if (typeof c !== 'number' || !Number.isFinite(c)) {
            out[k] = { ...f, confidence: 0 };
          }
        }
      }
      return out;
    }),
  };
}

/** Validated and normalized structured output, or null. */
export function parseVisionResult(raw: unknown): VisionResult | null {
  const parsed = VisionResult.safeParse(sanitizeConfidences(raw));
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    spines: parsed.data.spines.map((s) => {
      const out = { ...s };
      for (const k of FIELD_KEYS) out[k] = normalizeField(s[k]);
      return out;
    }),
  };
}

function subtypeError(
  subtype: string | undefined,
  envelope: CliEnvelope,
  fallback: string,
): VisionOutcome {
  if (subtype === 'error_max_turns') {
    return {
      ok: false,
      kind: 'truncated',
      detail: 'max turns reached',
      envelope,
    };
  }
  if (subtype === 'error_max_structured_output_retries') {
    return {
      ok: false,
      kind: 'schema_invalid',
      detail: 'structured output retries exhausted',
      envelope,
    };
  }
  return { ok: false, kind: 'failed', detail: cut(fallback), envelope };
}

export function classifyVisionRun(
  run: RunResult,
  maxBuffer = VISION_MAX_BUFFER,
): VisionOutcome {
  if (run.spawnError) {
    return run.spawnError.code === 'ENOENT'
      ? { ok: false, kind: 'cli_unavailable', detail: 'Claude CLI not found' }
      : {
          ok: false,
          kind: 'failed',
          detail: cut(`could not start the CLI (${run.spawnError.code})`),
        };
  }
  if (run.timedOut) return { ok: false, kind: 'timeout', detail: 'timed out' };
  if (run.aborted) {
    return { ok: false, kind: 'interrupted', detail: 'interrupted' };
  }
  if (run.stdout.length >= maxBuffer) {
    return { ok: false, kind: 'truncated', detail: 'output truncated' };
  }

  const env = CliEnvelope.safeParse(parseJson(run.stdout));
  if (!env.success) {
    return {
      ok: false,
      kind: 'failed',
      detail:
        firstLine(run.stderr) ||
        (run.exitCode !== 0
          ? `the CLI exited with code ${run.exitCode}`
          : 'unreadable CLI output'),
    };
  }
  const envelope = env.data;
  if (envelope.is_error) {
    const text =
      envelope.result?.trim() ||
      envelope.subtype ||
      'the CLI reported an error';
    if (LOGIN_HINT.test(text)) {
      return {
        ok: false,
        kind: 'cli_unavailable',
        detail: cut(text),
        envelope,
      };
    }
    return subtypeError(envelope.subtype, envelope, text);
  }
  if (envelope.subtype !== undefined && envelope.subtype !== 'success') {
    return subtypeError(envelope.subtype, envelope, envelope.subtype);
  }
  if (envelope.structured_output === undefined) {
    return {
      ok: false,
      kind: 'refused',
      detail: cut(envelope.result || 'no structured output'),
      envelope,
    };
  }
  const result = parseVisionResult(envelope.structured_output);
  if (!result) {
    return {
      ok: false,
      kind: 'schema_invalid',
      detail: 'structured output does not match the schema',
      envelope,
    };
  }
  return { ok: true, result, envelope };
}
