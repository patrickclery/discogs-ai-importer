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

/**
 * The run's fallback country in its canonical spelling, or null when there
 * is no second tier: the fallback is missing, blank, or the preferred
 * country itself (US and USA count as equal). The one rule every caller
 * uses for "is there a fallback tier" (G-06-side-1).
 */
export function distinctFallback(
  preferred: string,
  fallback: string | null | undefined,
): string | null {
  if (typeof fallback !== 'string') return null;
  const canonical = canonicalCountry(fallback);
  if (canonical === null) return null;
  return countryMatch(canonical, preferred) === 'exact' ? null : canonical;
}

export type PressingChoice =
  | { use: 'top'; outcome: PressingOutcome }
  | {
      use: 'version';
      version: VersionLite;
      outcome: 'preferred' | 'fallback_country';
    };

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
 * One tier's verdict. empty: no version from the country and the top match
 * does not name it. top: the top match itself (a combined country) ranked
 * best. guard: the best version failed the D-21 title guard. version: the
 * best version, title checked.
 */
type TierResult =
  | { kind: 'empty' }
  | { kind: 'top' }
  | { kind: 'guard' }
  | { kind: 'version'; version: VersionLite };

/**
 * Ranks one tier's versions for one country. Best first: official before
 * bootleg (D-18), exact country before combined (D-19), CD, the top match's
 * label, the earliest year (D-03), then the lowest id. A top match whose
 * country names this one among others joins the pool as a synthetic entry.
 * The title guard checks the winner only (D-21). The preferred and the
 * fallback tier share this, so both rank with the same key.
 */
function rankTier(
  top: TopMatchLite,
  country: string,
  versions: readonly VersionLite[],
): TierResult {
  const labels = new Set(top.labels.map(normalized).filter(Boolean));
  const pool: Ranked[] = [];
  for (const v of versions) {
    const match = countryMatch(v.country, country);
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
  if (countryMatch(top.country, country) === 'combined') {
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
  if (pool.length === 0) return { kind: 'empty' };

  pool.sort((a, b) => compareKeys(a.key, b.key));
  const best = pool[0].version;
  if (best === null) return { kind: 'top' };
  if (!titleMatches(best.title, releaseTitleOf(top.title))) {
    return { kind: 'guard' };
  }
  return { kind: 'version', version: best };
}

type PressingInput = {
  top: TopMatchLite;
  preferred: string;
  /** The run's second-choice country (G-06-side-1). */
  fallback?: string | null;
  /** The preferred-country versions answer (D-01). */
  versions?: VersionLite[] | 'unusable';
  /** A second versions answer, filtered to the fallback country. */
  fallbackVersions?: VersionLite[] | 'unusable';
};

/**
 * The fallback tier, reached only when the master is usable and lists no
 * version from the preferred country. It mirrors the preferred tier: a top
 * match exactly from the fallback country is used as is (D-02), and a top
 * match whose combined country names it counts as from there (D-19), so
 * every keep-the-top answer for it is fallback_country.
 */
function chooseFallbackTier(input: PressingInput): PressingChoice {
  const { top, fallbackVersions } = input;
  const second = distinctFallback(input.preferred, input.fallback);
  if (second === null) return { use: 'top', outcome: 'fallback_no_version' };
  const topMatch = countryMatch(top.country, second);
  if (topMatch === 'exact') return { use: 'top', outcome: 'fallback_country' };
  const keep = (
    outcome: PressingOutcome,
  ): { use: 'top'; outcome: PressingOutcome } => ({
    use: 'top',
    outcome: topMatch === 'combined' ? 'fallback_country' : outcome,
  });

  if (fallbackVersions === undefined) return keep('fallback_no_version');
  if (fallbackVersions === 'unusable') return keep('fallback_unusable_master');

  const tier = rankTier(top, second, fallbackVersions);
  switch (tier.kind) {
    case 'empty':
      return { use: 'top', outcome: 'fallback_no_version' };
    case 'top':
      return { use: 'top', outcome: 'fallback_country' };
    case 'guard':
      return keep('fallback_unusable_master');
    case 'version':
      return {
        use: 'version',
        version: tier.version,
        outcome: 'fallback_country',
      };
  }
}

/**
 * True only when a second versions request, filtered to the fallback
 * country, could change the choice: there is a distinct fallback country,
 * the preferred answer is usable yet its tier is empty (no version from the
 * preferred country, and the top match does not name it), and the top match
 * is not already exactly from the fallback country. The job (Plan 06-16)
 * sends the second GET only when this is true, which keeps the extra Discogs
 * request to spines where it can change the result.
 */
export function needsFallbackLookup(input: {
  top: TopMatchLite;
  preferred: string;
  fallback?: string | null;
  versions?: VersionLite[] | 'unusable';
}): boolean {
  const { top, preferred, versions } = input;
  const second = distinctFallback(preferred, input.fallback);
  if (second === null || !Array.isArray(versions)) return false;
  if (!needsLookup(top, preferred)) return false;
  if (countryMatch(top.country, second) === 'exact') return false;
  return rankTier(top, preferred, versions).kind === 'empty';
}

/**
 * The release to import: the preferred country first, then the run's
 * fallback country (G-06-side-1), then the top match. Both tiers rank with
 * rankTier. Every fallback is the top match itself, never some other
 * release.
 */
export function choosePressing(input: PressingInput): PressingChoice {
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

  const tier = rankTier(top, preferred, versions);
  switch (tier.kind) {
    case 'top':
      return { use: 'top', outcome: 'preferred' };
    case 'guard':
      return fallback('fallback_unusable_master');
    case 'version':
      return { use: 'version', version: tier.version, outcome: 'preferred' };
    case 'empty':
      return chooseFallbackTier(input);
  }
}
