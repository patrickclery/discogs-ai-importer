import { connection } from 'next/server';
import { SpinesView } from '@/components/spines-view';
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
  return (
    <SpinesView
      initialData={getSpines({ photoId, review })}
      initialPhoto={photoId ?? null}
      initialReview={review}
    />
  );
}
