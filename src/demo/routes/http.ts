// Shared request parsing for the demo's mutation routes (T-05-18): the real
// routes' JSON-only guard (415), JSON.parse in try/catch (400) and a strict
// zod copy of the body schema (400), with the real error bodies. Two body
// styles exist: the fields route's bare { error } and everyone else's
// { error, message }.
import { z } from 'zod';
import type { DemoRequest, DemoResponse } from '../routes';

/** Short pause on mutations so the buttons show their pending state. */
export const MUTATION_DELAY_MS = 250;

export function reply(status: number, body: unknown): DemoResponse {
  return { status, body, delayMs: MUTATION_DELAY_MS };
}

export function fail(
  status: number,
  error: string,
  message: string,
): DemoResponse {
  return reply(status, { error, message });
}

export function isJson(req: DemoRequest): boolean {
  return /^application\/json\s*(;|$)/i.test(
    req.headers.get('content-type') ?? '',
  );
}

export function parseRaw(req: DemoRequest): { ok: boolean; value: unknown } {
  if (req.body === null) return { ok: false, value: undefined };
  try {
    return { ok: true, value: JSON.parse(req.body) as unknown };
  } catch {
    return { ok: false, value: undefined };
  }
}

/** JSON only (415), parsed (400) against a strict schema (400). */
export function readBody<T>(
  req: DemoRequest,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; response: DemoResponse } {
  if (!isJson(req)) {
    return {
      ok: false,
      response: fail(415, 'unsupported_type', 'Send application/json.'),
    };
  }
  const raw = parseRaw(req);
  if (!raw.ok) {
    return {
      ok: false,
      response: fail(400, 'invalid_body', 'The request body is not JSON.'),
    };
  }
  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) {
    return {
      ok: false,
      response: fail(400, 'invalid_body', z.prettifyError(parsed.error)),
    };
  }
  return { ok: true, data: parsed.data };
}
