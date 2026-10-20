import { connection } from 'next/server';
import { SpinesView } from '@/components/spines-view';
import { getSpines } from '@/server/scan/queries';

// /spines (REV-01): the server render already holds the title block and the
// list, then SpinesView polls GET /api/spines while a photo is analyzed.

export default async function SpinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const raw = (await searchParams).photo;
  const photoId = (Array.isArray(raw) ? raw[0] : raw) || undefined;
  return (
    <SpinesView
      initialData={getSpines({ photoId })}
      initialPhoto={photoId ?? null}
    />
  );
}
