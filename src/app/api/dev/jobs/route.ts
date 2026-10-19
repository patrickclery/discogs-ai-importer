import { connection } from 'next/server';
import { z } from 'zod';
import { devHooksEnabled } from '@/server/config';
import { enqueue, listJobs } from '@/server/jobs/queue';

const MAX_PAYLOAD_BYTES = 4096;

const Body = z.object({
  lane: z.enum(['anthropic', 'discogs']).default('anthropic'),
  type: z.literal('noop').default('noop'),
  payload: z
    .record(z.string(), z.unknown())
    .refine(
      (p) => Buffer.byteLength(JSON.stringify(p), 'utf8') <= MAX_PAYLOAD_BYTES,
      { message: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes` },
    )
    .optional(),
  dedupeKey: z.string().min(1).max(200).optional(),
});

// The noop handler's own payload rules, checked at the edge so bad input is a 400.
const NoopPayload = z.object({
  ms: z.number().int().min(0).max(120000).optional(),
});

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

export async function GET() {
  await connection();
  if (!devHooksEnabled()) return notFound();
  const jobs = listJobs(200).map((j) => ({
    id: j.id,
    lane: j.lane,
    type: j.type,
    status: j.status,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    runAfter: j.runAfter,
    lastError: j.lastError,
    payload: JSON.parse(j.payload) as unknown,
    createdAt: j.createdAt,
    finishedAt: j.finishedAt,
  }));
  return Response.json({ jobs });
}

export async function POST(req: Request) {
  await connection();
  if (!devHooksEnabled()) return notFound();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { lane, type, payload, dedupeKey } = parsed.data;
  const noop = NoopPayload.safeParse(payload ?? {});
  if (!noop.success) {
    return Response.json(
      { error: z.prettifyError(noop.error) },
      { status: 400 },
    );
  }
  const result = enqueue({ lane, type, payload: payload ?? {}, dedupeKey });
  return Response.json(result, { status: result.created ? 201 : 200 });
}
