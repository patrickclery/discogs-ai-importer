import { connection } from 'next/server';
import { getDb } from '@/server/db/client';
import { ensureThumb } from '@/server/discogs/thumbs';

// A candidate's cover (D-13, DISC-04). The cover URL is read from
// discogs_candidates by id, never taken from the request (T-03-24). The
// first request downloads and caches it under DATA_DIR/discogs-thumbs;
// every answer then redirects to the allowlisted /api/files root. Any
// failure is the files-route 404, so the row shows its placeholder.

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  const row = getDb()
    .$client.prepare('SELECT thumb_url FROM discogs_candidates WHERE id = @id')
    .get({ id }) as { thumb_url: string | null } | undefined;
  if (!row?.thumb_url) return notFound();

  const thumb = await ensureThumb(row.thumb_url);
  if (!thumb) return notFound();
  return new Response(null, {
    status: 307,
    headers: {
      Location: `/api/files/${thumb.rel}`,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
