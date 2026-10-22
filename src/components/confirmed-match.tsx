'use client';

import { CircleCheck, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { CandidateRowContent } from '@/components/candidate-row';
import { Spinner } from '@/components/ui/spinner';
import { useSecondsUntil } from '@/components/use-seconds-until';
import { pausedLine } from '@/lib/candidate-format';
import type { CandidateDto } from '@/lib/discogs-types';
import type { ImportDto } from '@/lib/import-types';
import { importStateLine } from '@/lib/import-view';
import type { SpineDto } from '@/lib/scan-types';

// The confirmed-match panel (UI-SPEC Confirmed-match panel, D-01, D-02,
// D-09): while a spine has an import, the card shows only the release the
// owner confirmed, in a bordered box, then one state line and an action
// row. The other candidates come back only through Change match.

/**
 * The confirmed release in CandidateRowContent's shape, from the import's
 * stored snapshot (it survives a re-search replacing the candidate row).
 * With no snapshot the title falls back to "Release {id}" and the Disc3
 * placeholder shows; the external link is built from the integer id.
 */
export function confirmedCandidate(dto: ImportDto): CandidateDto {
  const snap = dto.candidate;
  return {
    id: dto.candidateId ?? `release-${dto.releaseId}`,
    releaseId: dto.releaseId,
    title: snap?.title ?? `Release ${dto.releaseId}`,
    year: snap?.year ?? null,
    country: snap?.country ?? null,
    labels: snap?.labels ?? [],
    catno: snap?.catno ?? null,
    formats: snap?.formats ?? [],
    hasThumb: dto.hasThumb && dto.candidateId !== null,
    source: 'auto',
    catnoMatch: false,
    stage: null,
  };
}

function StateLine({
  icon,
  children,
  className,
  role,
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  role?: 'status';
}) {
  return (
    <p
      role={role}
      className={`flex items-start gap-1 text-xs ${className ?? 'text-muted-foreground'}`}
    >
      {icon}
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

const ICON = 'mt-px size-4 shrink-0';

export function ConfirmedMatch({
  spine,
  pausedUntil,
}: {
  spine: SpineDto;
  /** SpinesResponse.discogs.pausedUntil: the paused countdown while waiting. */
  pausedUntil: number | null;
}) {
  const dto = spine.import;
  const waiting = dto?.phase === 'waiting';
  const pausedSeconds = useSecondsUntil(pausedUntil, waiting);
  if (!dto) return null;
  const candidate = confirmedCandidate(dto);
  const line = importStateLine(dto, Date.now());

  let stateLine: ReactNode = null;
  if (line?.tone === 'waiting') {
    stateLine = (
      <StateLine icon={<Clock aria-hidden="true" className={ICON} />}>
        {pausedSeconds > 0 ? pausedLine(pausedSeconds) : line.text}
      </StateLine>
    );
  } else if (line?.tone === 'importing') {
    stateLine = (
      <StateLine
        role="status"
        icon={
          <Spinner
            aria-hidden="true"
            role="presentation"
            className="mt-px shrink-0"
          />
        }
      >
        {line.text}
      </StateLine>
    );
  } else if (line?.tone === 'success') {
    stateLine = (
      <StateLine
        className="text-foreground"
        icon={
          <CircleCheck aria-hidden="true" className={`${ICON} text-success`} />
        }
      >
        {line.text}
      </StateLine>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-4 rounded-lg border p-2">
        <CandidateRowContent candidate={candidate} />
      </div>
      {stateLine}
    </div>
  );
}
