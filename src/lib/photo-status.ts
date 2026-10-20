// Photo status view model (UI-SPEC status mapping table). Pure and
// client-safe: the one place a run status becomes a label and sub-line.
import type { PhotoDto, PhotoStatus } from './scan-types';

export type StatusTone = 'muted' | 'spinner' | 'success' | 'destructive';

/** Client-only upload states shown before the server has a row (02-07). */
export type ClientUploadStatus = 'waiting' | 'uploading';
export type BadgeStatus = PhotoStatus | ClientUploadStatus;

const BADGES: Record<BadgeStatus, { label: string; tone: StatusTone }> = {
  waiting: { label: 'Waiting', tone: 'muted' },
  uploading: { label: 'Uploading', tone: 'spinner' },
  queued: { label: 'Queued', tone: 'muted' },
  preparing: { label: 'Analyzing', tone: 'spinner' },
  calling: { label: 'Analyzing', tone: 'spinner' },
  parsing: { label: 'Analyzing', tone: 'spinner' },
  done: { label: 'Done', tone: 'success' },
  error: { label: 'Error', tone: 'destructive' },
};

/** Badge label and icon tone for a status (the single mapping). */
export function badgeFor(status: BadgeStatus): {
  label: string;
  tone: StatusTone;
} {
  return BADGES[status];
}

export type StatusView = {
  label: string;
  tone: StatusTone;
  subline: string;
};

const ACTIVE: ReadonlySet<PhotoStatus> = new Set([
  'queued',
  'preparing',
  'calling',
  'parsing',
]);

/** Polling interval while any photo is still being worked on (D-12). */
export const ACTIVE_POLL_MS = 1500;

export function isActiveStatus(status: PhotoStatus): boolean {
  return ACTIVE.has(status);
}

export function pluralize(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Elapsed time as m:ss; negative or non-finite input reads 0:00. */
export function formatElapsed(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type StatusInput = Pick<
  PhotoDto,
  'status' | 'spawnedAt' | 'spineCount' | 'modelLabel' | 'errorReason'
>;

function sublineFor(photo: StatusInput, now: number): string {
  switch (photo.status) {
    case 'queued':
      return 'Waiting for the worker';
    case 'preparing':
      return 'Preparing image…';
    case 'calling':
      return `Claude is reading the spines… ${formatElapsed(
        photo.spawnedAt === null ? 0 : now - photo.spawnedAt,
      )}`;
    case 'parsing':
      return 'Cropping spines…';
    case 'done': {
      if (photo.spineCount === 0) return 'No CDs found';
      const count = pluralize(photo.spineCount, 'spine', 'spines');
      return photo.modelLabel ? `${count} · ${photo.modelLabel}` : count;
    }
    case 'error':
      return photo.errorReason ?? 'Scan failed. Re-scan to try again.';
  }
}

export function statusView(photo: StatusInput, now: number): StatusView {
  return { ...badgeFor(photo.status), subline: sublineFor(photo, now) };
}

/** refetchInterval for the photos query: 1.5 s while any photo is active. */
export function photosRefetchInterval(
  photos: readonly Pick<PhotoDto, 'status'>[] | undefined,
): number | false {
  return photos?.some((p) => isActiveStatus(p.status)) ? ACTIVE_POLL_MS : false;
}
