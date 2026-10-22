// Copy and state rules for the card's import UI (UI-SPEC Candidate row,
// Confirmed-match panel, Copywriting Contract). Pure and client-safe: the
// components render what these return, and the unit tests pin the copy.
import type { DuplicateBody, ImportDto, ImportFailure } from './import-types';
import { formatRelativeTime } from './spine-review';

/** The folder new imports go to, falling back to Uncategorized (id 1). */
export function addFolderName(folderName: string | null | undefined): string {
  const name = folderName?.trim();
  return name ? name : 'Uncategorized';
}

/** The card's primary CTA: "Add to {folder}" (D-01). */
export function addButtonLabel(folderName: string | null | undefined): string {
  return `Add to ${addFolderName(folderName)}`;
}

export const CONNECT_FIRST = 'Connect Discogs in Settings first';
export const RECONNECT_FIRST = 'Reconnect Discogs in Settings first';

/** Why Add is disabled, or null when it can be clicked. */
export function addDisabledReason(input: {
  connected: boolean;
  needsReconnect: boolean;
}): string | null {
  if (input.connected) return null;
  return input.needsReconnect ? RECONNECT_FIRST : CONNECT_FIRST;
}

export const ALREADY_CONFIRMED_ERROR =
  'This spine already has a match being added. It will show here in a moment.';
export const NOT_ON_DISCOGS_ERROR =
  'This spine is marked not on Discogs. Unmark it first.';

/** The inline line under the candidate list when Add is refused. */
export function addErrorText(code: string | null, reason: string): string {
  if (code === 'already_confirmed') return ALREADY_CONFIRMED_ERROR;
  if (code === 'not_on_discogs') return NOT_ON_DISCOGS_ERROR;
  return `Couldn't add it: ${reason}.`;
}

export type ImportStateTone = 'waiting' | 'importing' | 'success';

/**
 * The confirmed-match panel's state line for an import on its way or done.
 * Failed and already-in-collection imports have their own lines (null here).
 * {folder} is the import's own folder (D-03): each spine keeps the folder it
 * was added to.
 */
export function importStateLine(
  dto: Pick<ImportDto, 'phase' | 'folderName' | 'linked' | 'importedAt'>,
  now: number,
): { tone: ImportStateTone; text: string } | null {
  const folder = addFolderName(dto.folderName);
  switch (dto.phase) {
    case 'waiting':
      return {
        tone: 'waiting',
        text: `Waiting its turn to be added to ${folder}. Discogs allows about one request per second.`,
      };
    case 'importing':
      return {
        tone: 'importing',
        text: `Adding it to ${folder} on Discogs…`,
      };
    case 'imported': {
      if (dto.linked) {
        return {
          tone: 'success',
          text: `Linked to the copy already in your Discogs collection, in ${folder}.`,
        };
      }
      const added =
        dto.importedAt === null
          ? ''
          : ` Added ${formatRelativeTime(dto.importedAt, now)}.`;
      return {
        tone: 'success',
        text: `In your Discogs collection, in ${folder}.${added}`,
      };
    }
    default:
      return null;
  }
}

export const BEING_ADDED_TOOLTIP =
  "It's being added now. Wait for it to finish.";
export const RETRY_FIRST_TOOLTIP =
  'Retry first. Discogs may already have added it.';
/** The 409 started answer to Change match (same copy as the route). */
export const CHANGE_STARTED_ERROR =
  "It's already being added to Discogs, so the match can't be changed now.";

const RETRY_CHECKS_FIRST =
  'Retry checks your collection first, so it never adds a second copy.';

export type ImportFailureLine = {
  text: string;
  /** Auth only: the accent "Open Settings" link and the words after it. */
  settingsLink: { label: string; href: string; after: string } | null;
};

/** The short reason for the "other" line, without a final period. */
function otherReason(failure: ImportFailure | null): string {
  if (failure?.kind === 'removed') {
    return 'the spine was removed before the import ran';
  }
  return (
    failure?.reason?.trim().replace(/[.\s]+$/u, '') || 'something went wrong'
  );
}

/**
 * The confirmed-match panel's failure line (UI-SPEC import failure lines,
 * D-09). Each line names its next step: Open Settings, Change the match, or
 * Retry. A removed spine and an unknown failure use the other line.
 */
export function importFailureLine(
  failure: ImportFailure | null,
): ImportFailureLine {
  switch (failure?.kind) {
    case 'auth':
      return {
        text: 'Import failed: Discogs rejected the connection.',
        settingsLink: {
          label: 'Open Settings',
          href: '/settings',
          after: ' to reconnect, then retry.',
        },
      };
    case 'not_found':
      return {
        text: 'Import failed: Release not found on Discogs. Change the match.',
        settingsLink: null,
      };
    case 'rejected':
      return {
        text: "Import failed: Discogs wouldn't add this release. Change the match, or retry later.",
        settingsLink: null,
      };
    case 'unavailable':
      return {
        text: `Import failed: Discogs didn't respond. ${RETRY_CHECKS_FIRST}`,
        settingsLink: null,
      };
    case 'interrupted':
      return {
        text: `The import was interrupted when the app stopped. ${RETRY_CHECKS_FIRST}`,
        settingsLink: null,
      };
    default:
      return {
        text: `Import failed: ${otherReason(failure)}. Retry the import.`,
        settingsLink: null,
      };
  }
}

export type ChangeMatchState = {
  /** Every state except imported offers Change match (D-02). */
  show: boolean;
  enabled: boolean;
  /** Why it is disabled, shown in a tooltip; null when enabled. */
  tooltip: string | null;
};

/**
 * Change match follows the API's canChangeMatch (the same rule the DELETE
 * route applies, so the card never offers a change after something may
 * have reached Discogs). A failed import that may have been added says to
 * retry first (D-07 reconcile path); anything else is being added now.
 */
export function changeMatchState(
  dto: Pick<ImportDto, 'phase' | 'canChangeMatch'>,
): ChangeMatchState {
  if (dto.phase === 'imported') {
    return { show: false, enabled: false, tooltip: null };
  }
  if (dto.canChangeMatch) return { show: true, enabled: true, tooltip: null };
  return {
    show: true,
    enabled: false,
    tooltip: dto.phase === 'failed' ? RETRY_FIRST_TOOLTIP : BEING_ADDED_TOOLTIP,
  };
}

/**
 * The local duplicate dialog's title (UI-SPEC Duplicate dialog, D-04):
 * the other spine's photo and number, done or still on its way.
 */
export function duplicateDialogTitle(
  body: Pick<DuplicateBody, 'photo' | 'spineNumber' | 'done'>,
): string {
  const verb = body.done ? 'Already imported' : 'Already being imported';
  return `${verb} from ${body.photo}, spine #${body.spineNumber}`;
}

/**
 * The first already-in-collection line (UI-SPEC Copywriting, D-05): how
 * many copies the owner already has, the first one's folder and the date
 * Discogs recorded.
 */
export function alreadyLine(
  existing: Pick<
    NonNullable<ImportDto['existing']>,
    'count' | 'folderName' | 'dateAdded'
  >,
): string {
  const folder = addFolderName(existing.folderName);
  const copies =
    existing.count === 1
      ? `1 copy in ${folder}`
      : `${existing.count} copies, the first in ${folder}`;
  const date = discogsDate(existing.dateAdded);
  const added = date === null ? '' : `, added ${date}`;
  return `You already have this release on Discogs: ${copies}${added}.`;
}

/** The second already-in-collection line (UI-SPEC Copywriting, D-05). */
export const ALREADY_DECISION_LINE =
  'Link this spine to that copy, or add another copy if you own two.';

const DISCOGS_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * A Discogs date_added (ISO 8601 with an offset) as "30 Nov 2015", using
 * the calendar date Discogs wrote (not the viewer's time zone), or null
 * when it is not a real date.
 */
function discogsDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(iso);
  if (!m || Number.isNaN(Date.parse(iso))) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d));
  if (utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) return null;
  return DISCOGS_DATE.format(utc);
}
