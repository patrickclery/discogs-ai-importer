import 'server-only';
import { z } from 'zod';
import type { CandidateFormat, SearchStage } from '@/lib/discogs-types';
import { releaseTitleOf, type VersionLite } from '@/lib/pressing';
import { capCodePoints } from './inputs';
import { toYear } from './search';

// GET /masters/{id}/versions (D-01): the path builder, the one query a
// lookup sends and the answer's parser. Every Discogs value is untrusted
// (T-06-01, T-06-02): strings are capped, each entry is parsed on its own
// and an implausible answer is refused as a whole.

/**
 * More versions than any real master lists for one country. An unknown or
 * merged master answers 200 with the whole database (RESEARCH Pitfall 2).
 */
export const MAX_PLAUSIBLE_VERSIONS = 1000;
const MAX_TITLE = 500;
const MAX_SHORT = 200;
const MAX_URL = 1000;
const MAX_MAJOR_FORMATS = 10;

/** The versions path of one master; throws on anything but a positive id. */
export function masterVersionsPath(masterId: number): string {
  if (!Number.isSafeInteger(masterId) || masterId < 1) {
    throw new Error('invalid master id');
  }
  return `/masters/${masterId}/versions`;
}

/**
 * One page of CDs in the country, earliest first, so a master with more
 * than 100 matches still offers its earliest. The country goes verbatim;
 * its canonical spelling comes from the setting.
 */
export function versionsQuery(country: string) {
  return {
    country,
    format: 'CD',
    per_page: 100,
    page: 1,
    sort: 'released',
    sort_order: 'asc',
  } as const;
}

/** Caps in code points, so a surrogate pair is never split. */
const cap = (max: number) => z.string().transform((s) => capCodePoints(s, max));

/** One versions entry; unknown keys are stripped. */
export const VersionSchema = z.object({
  id: z.number().int().positive(),
  title: cap(MAX_TITLE).nullish(),
  label: cap(MAX_SHORT).nullish(),
  format: cap(MAX_TITLE).nullish(),
  catno: cap(MAX_SHORT).nullish(),
  released: cap(20).nullish(),
  country: cap(100).nullish(),
  thumb: cap(MAX_URL).nullish(),
  major_formats: z
    .array(cap(MAX_SHORT))
    .transform((a) => a.slice(0, MAX_MAJOR_FORMATS))
    .nullish(),
});

/** The envelope; each entry is checked separately. */
export const VersionsEnvelopeSchema = z.object({
  pagination: z.object({ items: z.number().int().nonnegative() }).loose(),
  versions: z.array(z.unknown()),
});

/**
 * The parsed entries, or 'unusable' when the answer claims more versions
 * than a real master has. Throws only when the envelope itself is wrong.
 */
export function parseVersions(json: unknown): VersionLite[] | 'unusable' {
  const env = VersionsEnvelopeSchema.safeParse(json);
  if (!env.success) {
    throw new Error('Discogs answered an unexpected versions body');
  }
  if (env.data.pagination.items > MAX_PLAUSIBLE_VERSIONS) return 'unusable';
  const out: VersionLite[] = [];
  for (const raw of env.data.versions) {
    const r = VersionSchema.safeParse(raw);
    if (!r.success) continue;
    const v = r.data;
    out.push({
      id: v.id,
      title: v.title ?? null,
      label: v.label ?? null,
      country: v.country ?? null,
      majorFormats: v.major_formats ?? [],
      format: v.format ?? null,
      catno: v.catno ?? null,
      released: v.released ?? null,
      thumb: v.thumb?.trim() || null,
    });
  }
  return out;
}

/** The candidate row values for a chosen pressing (stored by Plan 06-02). */
export type PressingCandidateValues = {
  releaseId: number;
  title: string;
  artist: string | null;
  year: number | null;
  country: string | null;
  labels: string[];
  catno: string | null;
  formats: CandidateFormat[];
  thumbUrl: string | null;
  masterId: number | null;
  stage: SearchStage;
};

/** The text before the first ' - ' of a combined title. */
function artistOf(title: string): string | null {
  const at = title.indexOf(' - ');
  return at > 0 ? title.slice(0, at).trim() || null : null;
}

/**
 * A versions entry carries no artist and one label string, so the artist
 * comes from the top match and the title is rebuilt as "Artist - Title".
 */
export function pressingCandidateValues(
  version: VersionLite,
  top: { artist: string | null; title: string; masterId: number | null },
): PressingCandidateValues {
  const artist = top.artist ?? artistOf(top.title);
  const release = version.title ?? releaseTitleOf(top.title);
  const title = capCodePoints(
    artist ? `${artist} - ${release}` : release,
    MAX_TITLE,
  );
  return {
    releaseId: version.id,
    title,
    artist,
    year: toYear(version.released),
    country: version.country,
    labels: version.label ? [version.label] : [],
    catno: version.catno,
    formats: [
      {
        name: version.majorFormats[0] ?? 'CD',
        qty: null,
        descriptions: (version.format ?? '')
          .split(', ')
          .map((d) => d.trim())
          .filter(Boolean),
        text: null,
      },
    ],
    thumbUrl: version.thumb,
    masterId: top.masterId,
    stage: 'release',
  };
}
