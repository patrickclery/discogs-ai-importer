import { connection } from 'next/server';
import { dismissSpine } from '@/server/scan/orphans';

// Dismiss an orphaned spine (D-16): it leaves every list, but its stored
// edits stay in the database. T-02-26: JSON only (forces a CORS preflight);
// the proxy adds the same-origin check. T-02-27: only the state changes.

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
  const { id } = await params;
  const result = dismissSpine(id);
  if (result === 'not_found') {
    return Response.json(
      { error: 'not_found', message: 'This spine no longer exists.' },
      { status: 404 },
    );
  }
  if (result === 'conflict') {
    return Response.json(
      {
        error: 'conflict',
        message: 'Only a spine that is no longer detected can be dismissed.',
      },
      { status: 409 },
    );
  }
  return Response.json({ id, state: 'dismissed' });
}
