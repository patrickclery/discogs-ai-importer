// RED stub: replaced in GREEN.
import type { BulkItemDto, BulkItemPhase, BulkItemStatus, EligibilityReason } from './bulk-types';
import type { CandidateDto } from './discogs-types';
import type { SpineDto } from './scan-types';
export function topMatchOf(_s: Pick<SpineDto, 'discogs'>): CandidateDto | null { return null; }
export function bulkItemPhaseOf(_x: { status: BulkItemStatus; jobStatus: string | null }): BulkItemPhase { return 'resolved'; }
export function isCurrentBulkItem(_i: { importId: string | null; createdAt: number; id: string }, _l: { id: string; createdAt: number } | null): boolean { return false; }
export function eligibilityOf(_s: Pick<SpineDto, 'state' | 'notOnDiscogs' | 'discogs' | 'import'>, _i: BulkItemDto | null): { eligible: true; reason: null } | { eligible: false; reason: EligibilityReason } { return { eligible: false, reason: 'no_match' }; }
