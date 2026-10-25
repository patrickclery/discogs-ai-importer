// RED stub: replaced in GREEN.
import type { PressingOutcome } from './bulk-types';
import type { CandidateFormat } from './discogs-types';
export type VersionLite = { id: number; title: string | null; label: string | null; country: string | null; majorFormats: string[]; format: string | null; catno: string | null; released: string | null; thumb: string | null };
export type TopMatchLite = { releaseId: number; title: string; country: string | null; labels: string[]; masterId: number | null; year: number | null; formats: CandidateFormat[] };
export type PressingChoice = { use: 'top'; outcome: PressingOutcome } | { use: 'version'; version: VersionLite; outcome: 'preferred' };
export function canonicalCountry(_i: string): string | null { return ''; }
export function pressingPhrase(_c: string, _p: boolean): string { return ''; }
export function countryMatch(_c: string | null, _p: string): 'exact' | 'combined' | 'none' { return 'none'; }
export function releaseTitleOf(_t: string): string { return ''; }
export function titleMatches(_v: string | null, _w: string): boolean { return false; }
export function needsLookup(_t: TopMatchLite, _p: string): boolean { return true; }
export function choosePressing(_i: { top: TopMatchLite; preferred: string; versions?: VersionLite[] | 'unusable' }): PressingChoice { return { use: 'top', outcome: 'retried_earlier' }; }
