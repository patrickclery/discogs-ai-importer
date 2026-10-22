import { connection } from 'next/server';
import { SpinesView } from '@/components/spines-view';
import { parseStatusParam } from '@/lib/review-status';
import { getSpines, parseReviewParam } from '@/server/scan/queries';

// /spines (REV-01): the server render already holds the title block and the
// list, then SpinesView polls GET /api/spines while a photo is analyzed.

export default async function SpinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const photoId = first(params.photo) || undefined;
  const review = parseReviewParam(first(params.review));
  const status = parseStatusParam(first(params.status));
  return (
    <SpinesView
      initialData={getSpines({ photoId, review, status })}
      initialPhoto={photoId ?? null}
      initialReview={review}
      initialStatus={status ?? null}
    />
  );
}
