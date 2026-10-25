import 'server-only';
// RED stub: replaced in GREEN.
import type { VersionLite } from '@/lib/pressing';
export const MAX_PLAUSIBLE_VERSIONS = 1000;
export function masterVersionsPath(_m: number): string { return ''; }
export function versionsQuery(_c: string): Record<string, string | number> { return {}; }
export function parseVersions(_j: unknown): VersionLite[] | 'unusable' { return []; }
export function pressingCandidateValues(_v: VersionLite, _t: { artist: string | null; title: string; masterId: number | null }): Record<string, unknown> { return {}; }
