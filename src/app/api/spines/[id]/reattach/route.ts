import { connection } from 'next/server';
import { z } from 'zod';
import type { SpineDto } from '@/lib/scan-types';
import { listReattachCandidates, reattachSpine } from '@/server/scan/orphans';

// Re-attach an orphaned spine to a spine the latest re-scan newly found
// (D-16). GET lists the candidates; POST moves the orphan's edits onto the
// chosen one. T-02-25: the server recomputes the candidate set inside the
// write transaction. T-02-26: POST is JSON only (forces a CORS preflight);
// the proxy adds the same-origin check.

const Body = z.strictObject({ targetSpineId: z.string().min(1) });

const NOT_FOUND = {
  error: 'not_found',
  message: 'This spine no longer exists.',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  const result = listReattachCandidates(id);
  if (result.status !== 'ok') {
    return Response.json(NOT_FOUND, { status: 404 });
  }
  const body: { candidates: SpineDto[] } = { candidates: result.value };
  return Response.json(body);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const contentType = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return Response.json(
      { error: 'unsupported_type', message: 'Send application/json.' },
      { status: 415 },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json(
      { error: 'invalid_body', message: 'The request body is not JSON.' },
      { status: 400 },
    );
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', message: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { id } = await params;
  const result = reattachSpine(id, parsed.data.targetSpineId);
  if (result.status === 'not_found') {
    return Response.json(NOT_FOUND, { status: 404 });
  }
  if (result.status === 'conflict') {
    return Response.json(
      {
        error: 'conflict',
        message: 'That spine can no longer be re-attached there.',
      },
      { status: 409 },
    );
  }
  const dto: SpineDto = result.value;
  return Response.json(dto);
}
