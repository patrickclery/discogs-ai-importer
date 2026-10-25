// Which release a bulk import adds: the top match, or its pressing in the
// preferred country from one Discogs versions answer (D-02, D-03, D-04,
// D-18, D-19, D-21). Pure and client-safe: the job, the read model and the
// demo all call these, so the country rules live in one place.
import type { PressingOutcome } from './bulk-types';
import type { CandidateFormat } from './discogs-types';

/**
 * Discogs country spelling -> demonym (UI-SPEC "Country wording"). The keys
 * are also the canonical spellings canonicalCountry restores, because the
 * versions filter is case-sensitive (RESEARCH Pitfall 1).
 */
export const COUNTRY_DEMONYMS: Readonly<Record<string, string>> = {
  Canada: 'Canadian',
  US: 'US',
  UK: 'UK',
  Germany: 'German',
  Japan: 'Japanese',
  France: 'French',
  Europe: 'European',
  Australia: 'Australian',
  Netherlands: 'Dutch',
  Italy: 'Italian',
  Mexico: 'Mexican',
  Brazil: 'Brazilian',
};

/** Other spellings of a canonical country, keyed in lower case. */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  usa: 'US',
  'united states': 'US',
  'united kingdom': 'UK',
};

const BY_LOWER = new Map<string, string>([
  ...Object.keys(COUNTRY_DEMONYMS).map(
    (c) => [c.toLowerCase(), c] as [string, string],
  ),
  ...Object.entries(COUNTRY_ALIASES),
]);

/** The Discogs spelling of a known country, else the trimmed text; '' -> null. */
export function canonicalCountry(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  return BY_LOWER.get(t.toLowerCase()) ?? t;
}

/** "Canadian pressing(s)" for a known country, else "pressing(s) from X". */
export function pressingPhrase(country: string, plural: boolean): string {
  const noun = plural ? 'pressings' : 'pressing';
  const canonical = canonicalCountry(country);
  const demonym = canonical ? COUNTRY_DEMONYMS[canonical] : undefined;
  return demonym ? `${demonym} ${noun}` : `${noun} from ${country.trim()}`;
}

/** Lower case, trimmed, US and USA equal. */
function countryKey(s: string): string {
  const k = s.trim().toLowerCase();
  return k === 'usa' ? 'us' : k;
}

/**
 * exact: the country is the preferred one. combined: a Discogs combined
 * country such as "USA & Canada" names it among two or more (D-19).
 */
export function countryMatch(
  country: string | null,
  preferred: string,
): 'exact' | 'combined' | 'none' {
  if (!country) return 'none';
  const want = countryKey(preferred);
  if (!want) return 'none';
  if (countryKey(country) === want) return 'exact';
  const parts = country.split(/[&,/]/).map(countryKey).filter(Boolean);
  return parts.length >= 2 && parts.includes(want) ? 'combined' : 'none';
}

/** The release part of Discogs' combined "Artist - Title". */
export function releaseTitleOf(candidateTitle: string): string {
  const at = candidateTitle.indexOf(' - ');
  return at >= 0 ? candidateTitle.slice(at + 3) : candidateTitle;
}

/** NFKC, upper case, letters and digits only. */
function normalized(s: string | null | undefined): string {
  if (typeof s !== 'string') return '';
  return s
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * The D-21 title guard: either normalized title contains the other. An
 * empty wanted title has nothing to check; a missing version title never
 * passes a real one.
 */
export function titleMatches(
  versionTitle: string | null,
  wanted: string,
): boolean {
  const w = normalized(wanted);
  if (!w) return true;
  const v = normalized(versionTitle);
  if (!v) return false;
  return v.includes(w) || w.includes(v);
}

/** One entry of a /masters/{id}/versions answer, as parseVersions maps it. */
export type VersionLite = {
  id: number;
  title: string | null;
  label: string | null;
  country: string | null;
  majorFormats: string[];
  /** Discogs' descriptions string, e.g. "Album, Reissue". */
  format: string | null;
  catno: string | null;
  /** "1991"-style, or "0" for unknown. */
  released: string | null;
  thumb: string | null;
};

/** The spine's top match (rank-1 candidate), as choosePressing reads it. */
export type TopMatchLite = {
  releaseId: number;
  /** Discogs' combined "Artist - Title". */
  title: string;
  country: string | null;
  labels: string[];
  masterId: number | null;
  year: number | null;
  formats: CandidateFormat[];
};

/**
 * True only when a versions request is worth making: the top match is not
 * already in the preferred country and has a master (D-02, D-04).
 */
export function needsLookup(top: TopMatchLite, preferred: string): boolean {
  return (
    countryMatch(top.country, preferred) !== 'exact' &&
    typeof top.masterId === 'number' &&
    Number.isSafeInteger(top.masterId) &&
    top.masterId > 0
  );
}

export type PressingChoice =
  | { use: 'top'; outcome: PressingOutcome }
  | { use: 'version'; version: VersionLite; outcome: 'preferred' };

type Ranked = {
  key: [number, number, number, number, number, number];
  version: VersionLite | null;
};

function yearOf(released: string | null): number {
  const m = /^(\d{4})/.exec(released ?? '');
  return m && m[1] !== '0000' ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function compareKeys(a: Ranked['key'], b: Ranked['key']): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * The release to import. Ranking, best first: official before bootleg
 * (D-18), exact country before combined (D-19), CD, the top match's label,
 * the earliest year (D-03), then the lowest id. The title guard checks the
 * chosen version only (D-21). Every fallback is the top match itself, never
 * some other release.
 */
export function choosePressing(input: {
  top: TopMatchLite;
  preferred: string;
  versions?: VersionLite[] | 'unusable';
}): PressingChoice {
  const { top, preferred, versions } = input;
  const topMatch = countryMatch(top.country, preferred);
  if (topMatch === 'exact') return { use: 'top', outcome: 'preferred' };
  const combined = topMatch === 'combined';
  const fallback = (
    outcome: PressingOutcome,
  ): { use: 'top'; outcome: PressingOutcome } => ({
    use: 'top',
    outcome: combined ? 'preferred' : outcome,
  });

  if (top.masterId === null || versions === undefined) {
    return fallback('fallback_no_master');
  }
  if (versions === 'unusable') return fallback('fallback_unusable_master');

  const labels = new Set(top.labels.map(normalized).filter(Boolean));
  const pool: Ranked[] = [];
  for (const v of versions) {
    const match = countryMatch(v.country, preferred);
    if (match === 'none') continue;
    const label = normalized(v.label);
    pool.push({
      key: [
        /unofficial release/i.test(v.format ?? '') ? 1 : 0,
        match === 'exact' ? 0 : 1,
        v.majorFormats.includes('CD') ? 0 : 1,
        label && labels.has(label) ? 0 : 1,
        yearOf(v.released),
        v.id,
      ],
      version: v,
    });
  }
  if (combined) {
    const bootleg = top.formats.some((f) =>
      f.descriptions.some(
        (d) => d.trim().toLowerCase() === 'unofficial release',
      ),
    );
    pool.push({
      key: [
        bootleg ? 1 : 0,
        1,
        top.formats.some((f) => f.name === 'CD') ? 0 : 1,
        0,
        top.year ?? Number.POSITIVE_INFINITY,
        top.releaseId,
      ],
      version: null,
    });
  }
  if (pool.length === 0) return { use: 'top', outcome: 'fallback_no_version' };

  pool.sort((a, b) => compareKeys(a.key, b.key));
  const best = pool[0].version;
  if (best === null) return { use: 'top', outcome: 'preferred' };
  if (!titleMatches(best.title, releaseTitleOf(top.title))) {
    return fallback('fallback_unusable_master');
  }
  return { use: 'version', version: best, outcome: 'preferred' };
}
