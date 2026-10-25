'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  CircleCheck,
  CircleX,
  Clock,
  RotateCw,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import {
  ADD_BUTTON_ATTR,
  CHANGE_MATCH_ATTR,
  focusInCard,
} from '@/components/add-to-collection-button';
import { AlreadyInCollection } from '@/components/already-in-collection';
import { BulkStatusLine } from '@/components/bulk-status-line';
import { CandidateRowContent } from '@/components/candidate-row';
import { announceSpineAction } from '@/components/import-ui-context';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSecondsUntil } from '@/components/use-seconds-until';
import { countryBadgeOf } from '@/lib/bulk-view';
import { pausedLine } from '@/lib/candidate-format';
import type { CandidateDto } from '@/lib/discogs-types';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { ImportDto } from '@/lib/import-types';
import {
  BEING_ADDED_TOOLTIP,
  CHANGE_STARTED_ERROR,
  changeMatchState,
  importFailureLine,
  importStateLine,
} from '@/lib/import-view';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';

// The confirmed-match panel (UI-SPEC Confirmed-match panel, D-01, D-02,
// D-09, D-13): while a spine has an import, the card shows only the release
// the owner confirmed, in a bordered box, then one state line and an action
// row. Change match sends DELETE /api/spines/{id}/import and Retry import
// POST /api/spines/{id}/retry (Plan 04-12's routes decide what is safe; the
// card follows the API's canChangeMatch and canRetry). Every request error
// is an inline line under the action row, never a toast. An
// already_in_collection hold renders AlreadyInCollection (D-05): its
// decision line, Link existing copy and Add another copy, then Change match.

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

/** The state line for the import's phase (UI-SPEC panel table). */
function ImportStateLine({
  dto,
  pausedSeconds,
}: {
  dto: ImportDto;
  pausedSeconds: number;
}) {
  if (dto.phase === 'failed') {
    const failure = importFailureLine(dto.failure);
    return (
      <StateLine
        className="text-destructive"
        icon={<CircleX aria-hidden="true" className={ICON} />}
      >
        {failure.text}
        {failure.settingsLink ? (
          <>
            {' '}
            <Link
              href={failure.settingsLink.href}
              className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {failure.settingsLink.label}
            </Link>
            {failure.settingsLink.after}
          </>
        ) : null}
      </StateLine>
    );
  }
  const line = importStateLine(dto, Date.now());
  if (line?.tone === 'waiting') {
    return (
      <StateLine icon={<Clock aria-hidden="true" className={ICON} />}>
        {pausedSeconds > 0 ? pausedLine(pausedSeconds) : line.text}
      </StateLine>
    );
  }
  if (line?.tone === 'importing') {
    return (
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
  }
  if (line?.tone === 'success') {
    return (
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
  return null;
}

/** A disabled button with its reason in a tooltip on a focusable span. */
function WithReason({
  reason,
  children,
}: {
  reason: string | null;
  children: ReactNode;
}) {
  if (reason === null) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users reach the disabled reason
          tabIndex={0}
          className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

type Action = 'change' | 'retry';

export function ConfirmedMatch({
  spine,
  pausedUntil,
}: {
  spine: SpineDto;
  /** SpinesResponse.discogs.pausedUntil: the paused countdown while waiting. */
  pausedUntil: number | null;
}) {
  const queryClient = useQueryClient();
  const dto = spine.import;
  const pausedSeconds = useSecondsUntil(pausedUntil, dto?.phase === 'waiting');
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The import Change match was refused for (409 started): the button
  // stays disabled while that import is still on its way.
  const [refusedId, setRefusedId] = useState<string | null>(null);
  // Link existing copy or Add another copy is in flight (D-05).
  const [deciding, setDeciding] = useState(false);
  if (!dto) return null;

  const number = spineNumber(spine);
  const candidate = confirmedCandidate(dto);
  const change = changeMatchState(dto);
  const refused =
    refusedId === dto.id &&
    !dto.checking &&
    (dto.phase === 'waiting' || dto.phase === 'importing');
  const changeReason = refused
    ? BEING_ADDED_TOOLTIP
    : change.enabled
      ? null
      : change.tooltip;
  const showRetry = dto.phase === 'failed' && dto.canRetry;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['spines'] }),
      queryClient.invalidateQueries({
        queryKey: ['discogs-candidates', spine.id],
      }),
    ]);
    window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
  }

  async function run(action: Action) {
    if (!dto) return;
    setPending(action);
    setError(null);
    const importId = dto.id;
    const prefix =
      action === 'change'
        ? "Couldn't change the match"
        : "Couldn't retry the import";
    let done = false;
    // 202: Change match is checking the owner's copies first (CR-01); the
    // panel stays until the check finishes, so focus stays put.
    let checking = false;
    try {
      const res = await fetch(
        action === 'change'
          ? `/api/spines/${encodeURIComponent(spine.id)}/import`
          : `/api/spines/${encodeURIComponent(spine.id)}/retry`,
        {
          method: action === 'change' ? 'DELETE' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      if (!res.ok) {
        if (action === 'change' && (await errorCode(res)) === 'started') {
          setRefusedId(importId);
          setError(CHANGE_STARTED_ERROR);
          await refresh();
          return;
        }
        setError(`${prefix}: ${await failureReason(res)}.`);
        return;
      }
      done = true;
      checking = action === 'change' && res.status === 202;
      // No toast: the badge and the panel change in place (UI-SPEC).
      await refresh();
      announceSpineAction(spine.id, number);
    } catch {
      if (!done) setError(`${prefix}: ${UNREACHABLE_REASON}.`);
    } finally {
      setPending(null);
    }
    if (done && !checking) {
      // Change match: the candidate list is back, focus its first Add.
      // Retry: the panel is waiting again, focus Change match.
      focusInCard(
        spine.id,
        action === 'change' ? ADD_BUTTON_ATTR : CHANGE_MATCH_ATTR,
      );
    }
  }

  const actions: ReactNode[] = [];
  if (showRetry) {
    actions.push(
      <Button
        key="retry"
        type="button"
        variant="outline"
        size="sm"
        disabled={pending !== null}
        onClick={() => void run('retry')}
      >
        {pending === 'retry' ? (
          <>
            <Spinner aria-hidden="true" role="presentation" />
            Retrying…
          </>
        ) : (
          <>
            <RotateCw aria-hidden="true" />
            Retry import
          </>
        )}
      </Button>,
    );
  }
  if (change.show) {
    actions.push(
      <WithReason key="change" reason={changeReason}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-change-match=""
          disabled={pending !== null || deciding || changeReason !== null}
          tabIndex={changeReason !== null ? -1 : undefined}
          onClick={() => void run('change')}
        >
          {pending === 'change' ? (
            <>
              <Spinner aria-hidden="true" role="presentation" />
              Changing…
            </>
          ) : (
            <>
              <ArrowLeftRight aria-hidden="true" />
              Change match
            </>
          )}
        </Button>
      </WithReason>,
    );
  }

  const decision =
    dto.phase === 'already_in_collection' && dto.existing ? dto.existing : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-4 rounded-lg border p-2">
        <CandidateRowContent candidate={candidate} />
      </div>
      {countryBadgeOf(spine)?.kind === 'fallback' ? (
        <BulkStatusLine spine={spine} kinds={['fallback']} />
      ) : null}
      {decision ? (
        <AlreadyInCollection
          spineId={spine.id}
          spineNumber={number}
          existing={decision}
          disabled={pending !== null}
          onPendingChange={setDeciding}
          trailing={actions}
        />
      ) : (
        <>
          <ImportStateLine dto={dto} pausedSeconds={pausedSeconds} />
          {actions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </>
      )}
      {error && dto.phase !== 'imported' ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
