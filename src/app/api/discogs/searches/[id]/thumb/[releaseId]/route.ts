import { connection } from 'next/server';
import { getDb } from '@/server/db/client';
import { getSearch, parseStoredResults } from '@/server/discogs/store';
import { ensureThumb } from '@/server/discogs/thumbs';

// A Search Discogs dialog result's cover (D-15, UI-SPEC Search Discogs
// dialog). The cover URL is read from that search's stored results_json,
// never taken from the request (T-03-34); ensureThumb only fetches the
// allowlisted Discogs image host with redirects refused. Only manual and
// release searches are served, like the dialog's polling route. Every
// answer is a 307 to the allowlisted /api/files root or the files-route 404,
// so the row shows its placeholder.

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; releaseId: string }> },
) {
  await connection();
  const { id, releaseId } = await params;
  if (!/^[1-9]\d{0,9}$/.test(releaseId)) return notFound();
  const wanted = Number(releaseId);

  const row = getSearch(getDb().$client, id);
  if (!row || (row.kind !== 'manual' && row.kind !== 'release')) {
    return notFound();
  }
  const url = parseStoredResults(row.results_json).find(
    (c) => c.releaseId === wanted,
  )?.thumbUrl;
  if (!url) return notFound();

  const thumb = await ensureThumb(url);
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
