import { connection } from 'next/server';
import { startRescan } from '@/server/scan/rescan';

// Explicit re-scan of one photo (D-17, INGEST-04). It spends subscription
// quota, so the UI confirms first and the server refuses while a run is
// active. T-02-23: JSON only, which forces a CORS preflight; the proxy adds
// the same-origin check.

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
  const result = startRescan(id);
  if (result.status === 'not_found') {
    return Response.json(
      { error: 'not_found', message: 'This photo no longer exists.' },
      { status: 404 },
    );
  }
  if (result.status === 'active') {
    return Response.json(
      { error: 'run_active', message: 'This photo is already being analyzed.' },
      { status: 409 },
    );
  }
  return Response.json(
    { runId: result.runId, runNo: result.runNo },
    { status: 201 },
  );
}
