import { Rows3 } from 'lucide-react';
import { connection } from 'next/server';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { SpineDto } from '@/lib/scan-types';
import type { SpineField } from '@/lib/vision-contract';
import { listPhotos, listSpines } from '@/server/scan/queries';

// Server-rendered spine list (Plan 02-04 tracer). Plan 02-08 replaces it with
// the polled client list and Plan 02-09 adds editing and confidence styling.

const FIELD_LABELS: Record<SpineField, string> = {
  artist: 'Artist',
  title: 'Title',
  format: 'Format',
  label: 'Label',
  catalog_number: 'Catalog number',
  raw_text: 'Raw text',
};

function fieldValue(spine: SpineDto, field: SpineField): string | null {
  return spine.fields.find((f) => f.field === field)?.value ?? null;
}

function SpineCard({ spine, number }: { spine: SpineDto; number: number }) {
  const raw = fieldValue(spine, 'raw_text');
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-4 px-4">
        {spine.crop ? (
          // biome-ignore lint/performance/noImgElement: crops stream from a route handler; next/image would re-encode them
          <img
            src={spine.crop.url}
            width={spine.crop.width}
            height={spine.crop.height}
            alt={`Spine ${number}: ${raw ?? 'Not read'}`}
            loading="lazy"
            className="max-h-32 min-h-12 w-full rounded-md bg-muted object-contain"
          />
        ) : null}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {spine.fields.map((f) => (
            <div key={f.field} className="contents">
              <dt className="text-muted-foreground">{FIELD_LABELS[f.field]}</dt>
              <dd className={f.value === null ? 'text-muted-foreground' : ''}>
                {f.value ?? 'Not read'}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export default async function SpinesPage() {
  await connection();
  const spines = listSpines();
  if (spines.length === 0) {
    return (
      <Empty className="pt-16 pb-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Rows3 className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-base font-medium">
            No spines yet
          </EmptyTitle>
          <EmptyDescription>
            Spines appear here after you upload shelf photos.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const byPhoto = new Map<string, SpineDto[]>();
  for (const s of spines) {
    const list = byPhoto.get(s.photoId) ?? [];
    list.push(s);
    byPhoto.set(s.photoId, list);
  }
  const photos = listPhotos().filter((p) => byPhoto.has(p.id));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-8">
      <h1 className="text-2xl font-medium tracking-tight">Spines</h1>
      {photos.map((photo) => (
        <section key={photo.id} className="flex flex-col gap-4">
          <h2 className="truncate text-base font-medium" title={photo.filename}>
            {photo.filename}
          </h2>
          {(byPhoto.get(photo.id) ?? []).map((spine, i) => (
            <SpineCard key={spine.id} spine={spine} number={i + 1} />
          ))}
        </section>
      ))}
    </div>
  );
}
