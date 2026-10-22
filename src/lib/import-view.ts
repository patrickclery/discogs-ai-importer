// Copy and state rules for the card's import UI (UI-SPEC Candidate row,
// Confirmed-match panel, Copywriting Contract). Pure and client-safe: the
// components render what these return, and the unit tests pin the copy.
import type { ImportDto, ImportFailure } from './import-types';
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

// --- Task 2 stubs (RED): replaced by the implementation in the GREEN commit.

export const BEING_ADDED_TOOLTIP = '';
export const RETRY_FIRST_TOOLTIP = '';
export const CHANGE_STARTED_ERROR = '';

export type ImportFailureLine = {
  text: string;
  settingsLink: { label: string; href: string; after: string } | null;
};

export function importFailureLine(
  _failure: ImportFailure | null,
): ImportFailureLine {
  return { text: '', settingsLink: null };
}

export type ChangeMatchState = {
  show: boolean;
  enabled: boolean;
  tooltip: string | null;
};

export function changeMatchState(
  _dto: Pick<ImportDto, 'phase' | 'canChangeMatch'>,
): ChangeMatchState {
  return { show: false, enabled: false, tooltip: null };
}
