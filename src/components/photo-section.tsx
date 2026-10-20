import { SpineCard } from '@/components/spine-card';
import { pluralize } from '@/lib/photo-status';
import type { PhotoDto, SpineDto } from '@/lib/scan-types';

/** One photo's section on /spines: its header, then its spine cards. */
export function PhotoSection({
  photo,
  spines,
}: {
  photo: PhotoDto;
  spines: SpineDto[];
}) {
  const headingId = `photo-${photo.id}`;
  const subline = [
    pluralize(photo.spineCount, 'spine', 'spines'),
    photo.modelLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col">
        <h2
          id={headingId}
          className="truncate text-sm font-medium"
          title={photo.filename}
        >
          {photo.filename}
        </h2>
        <p className="text-xs text-muted-foreground">{subline}</p>
      </div>
      {spines.map((spine) => (
        <SpineCard key={spine.id} spine={spine} />
      ))}
    </section>
  );
}
