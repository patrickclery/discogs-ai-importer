import { connection } from 'next/server';
import { SpinesView } from '@/components/spines-view';
import { getSpines } from '@/server/scan/queries';

// /spines (REV-01): the server render already holds the list, then
// SpinesView polls GET /api/spines while a photo is being analyzed.

export default async function SpinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const raw = (await searchParams).photo;
  const photoId = (Array.isArray(raw) ? raw[0] : raw) || undefined;
  const initialData = getSpines({ photoId });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-medium tracking-tight">Spines</h1>
      <SpinesView initialData={initialData} initialPhoto={photoId ?? null} />
    </div>
  );
}
