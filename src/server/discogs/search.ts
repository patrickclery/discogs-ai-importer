import 'server-only';
import { z } from 'zod';
import type { CandidateFormat, SearchStage } from '@/lib/discogs-types';
import {
  capCodePoints,
  MAX_INPUT_CODE_POINTS,
  type SearchInputs,
} from './inputs';

// The search cascade (D-09) and candidate mapping (D-10), RESEARCH Pattern 4.
// Every Discogs value is untrusted (T-03-15): each result is parsed on its
// own and an invalid one is dropped, strings are capped and ids must be
// positive integers.

/** Results stored per search: the top 10 of the winning stage (D-10). */
export const PER_PAGE = 10;
const MAX_TITLE = 500;
const MAX_SHORT = 200;
const MAX_URL = 2000;
const MAX_LABELS = 20;
const MAX_FORMATS = 20;
const MAX_DESCRIPTIONS = 20;

export type SearchParams = Record<string, string | number>;

export type Stage = {
  stage: Exclude<SearchStage, 'release'>;
  params: SearchParams;
};

/** Discogs params every stage sends: releases only, CDs only (D-09). */
const COMMON_PARAMS = {
  type: 'release',
  format: 'CD',
  per_page: PER_PAGE,
  page: 1,
} as const;

/**
 * catno, then artist and/or release_title (A-03-10), then free text. A stage
 * is left out when it has nothing to send.
 */
export function buildStages(inputs: SearchInputs): Stage[] {
  const stages: Stage[] = [];
  if (inputs.catno) {
    stages.push({
      stage: 'catno',
      params: { catno: inputs.catno, ...COMMON_PARAMS },
    });
  }
  if (inputs.artist || inputs.title) {
    const params: SearchParams = {};
    if (inputs.artist) params.artist = inputs.artist;
    if (inputs.title) params.release_title = inputs.title;
    stages.push({
      stage: 'artist_title',
      params: { ...params, ...COMMON_PARAMS },
    });
  }
  const q = capCodePoints(
    inputs.rawText ??
      [inputs.artist, inputs.title, inputs.catno].filter(Boolean).join(' '),
    MAX_INPUT_CODE_POINTS,
  ).trim();
  if (q) stages.push({ stage: 'text', params: { q, ...COMMON_PARAMS } });
  return stages;
}

/** Caps in code points, so a surrogate pair is never split. */
const cap = (max: number) => z.string().transform((s) => capCodePoints(s, max));

const FormatSchema = z.object({
  name: cap(MAX_SHORT),
  qty: z.union([z.string(), z.number()]).nullish(),
  descriptions: z.array(z.unknown()).nullish(),
  text: z.string().nullish(),
});

/** One /database/search result; unknown keys are stripped. */
export const SearchResultSchema = z.object({
  id: z.number().int().positive(),
  title: cap(MAX_TITLE),
  year: z.union([z.string(), z.number()]).nullish(),
  country: z.string().nullish(),
  label: z.array(z.unknown()).nullish(),
  catno: z.string().nullish(),
  formats: z.array(z.unknown()).nullish(),
  thumb: z.string().nullish(),
  master_id: z.number().nullish(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

/** The envelope; each result is checked separately. */
export const SearchEnvelopeSchema = z.object({
  pagination: z.object({ items: z.number().int().nonnegative() }).loose(),
  results: z.array(z.unknown()),
});

export type ParsedSearch = { results: SearchResult[]; total: number };

/** Validates a search body; throws only when the envelope itself is wrong. */
export function parseSearchResponse(json: unknown): ParsedSearch {
  const env = SearchEnvelopeSchema.safeParse(json);
  if (!env.success) {
    throw new Error('Discogs search answered an unexpected body');
  }
  const results: SearchResult[] = [];
  for (const raw of env.data.results) {
    const r = SearchResultSchema.safeParse(raw);
    if (r.success) results.push(r.data);
  }
  return { results, total: env.data.pagination.items };
}

/** One /releases/{id} body (used by Plan 03-11's paste-a-release flow). */
export const ReleaseSchema = z.object({
  id: z.number().int().positive(),
  title: cap(MAX_TITLE),
  artists: z
    .array(
      z.object({
        name: cap(MAX_SHORT),
        anv: z.string().nullish(),
        join: z.string().nullish(),
      }),
    )
    .nullish(),
  year: z.union([z.string(), z.number()]).nullish(),
  country: z.string().nullish(),
  labels: z
    .array(z.object({ name: cap(MAX_SHORT), catno: z.string().nullish() }))
    .nullish(),
  formats: z.array(z.unknown()).nullish(),
  thumb: z.string().nullish(),
  images: z.array(z.object({ uri150: z.string().nullish() })).nullish(),
  master_id: z.number().nullish(),
});
export type Release = z.infer<typeof ReleaseSchema>;

export type Candidate = {
  releaseId: number;
  rank: number;
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
  catnoMatch: boolean;
};

/** A 4-digit year from a string or number; '0', '' and missing are null. */
export function toYear(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') {
    return Number.isInteger(v) && v >= 1000 && v <= 9999 ? v : null;
  }
  if (typeof v === 'string' && /^\d{4}$/.test(v.trim())) {
    const n = Number(v.trim());
    return n >= 1000 ? n : null;
  }
  return null;
}

function text(v: string | null | undefined, max = MAX_SHORT): string | null {
  if (typeof v !== 'string') return null;
  const t = capCodePoints(v.trim(), max).trim();
  return t || null;
}

function uniqueStrings(values: unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const v of values ?? []) {
    const t = typeof v === 'string' ? text(v) : null;
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_LABELS) break;
  }
  return out;
}

export function toFormats(
  raw: unknown[] | null | undefined,
): CandidateFormat[] {
  const out: CandidateFormat[] = [];
  for (const item of raw ?? []) {
    const f = FormatSchema.safeParse(item);
    if (!f.success) continue;
    const descriptions = (f.data.descriptions ?? [])
      .filter((d): d is string => typeof d === 'string')
      .map((d) => capCodePoints(d, MAX_SHORT))
      .slice(0, MAX_DESCRIPTIONS);
    out.push({
      name: f.data.name,
      qty:
        f.data.qty === null || f.data.qty === undefined
          ? null
          : capCodePoints(String(f.data.qty), 20),
      descriptions,
      text: text(f.data.text),
    });
    if (out.length >= MAX_FORMATS) break;
  }
  return out;
}

function masterId(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** The text before the first ' - ' of a combined title (stored only, A-03-12). */
function artistOf(title: string): string | null {
  const at = title.indexOf(' - ');
  return at > 0 ? title.slice(0, at).trim() || null : null;
}

export function toCandidateFromSearch(
  r: SearchResult,
  stage: SearchStage,
  rank: number,
): Candidate {
  return {
    releaseId: r.id,
    rank,
    title: r.title,
    artist: artistOf(r.title),
    year: toYear(r.year),
    country: text(r.country),
    labels: uniqueStrings(r.label),
    catno: text(r.catno),
    formats: toFormats(r.formats),
    thumbUrl: text(r.thumb, MAX_URL),
    masterId: masterId(r.master_id),
    stage,
    catnoMatch: false,
  };
}

/** "A, B & C": each artist name followed by its join. */
function artistsDisplay(artists: Release['artists']): string | null {
  const list = artists ?? [];
  if (list.length === 0) return null;
  let out = '';
  list.forEach((a, i) => {
    out += a.name;
    if (i === list.length - 1) return;
    const join = (a.join ?? '').trim();
    out += join === ',' ? ', ' : join ? ` ${join} ` : ', ';
  });
  return out.trim() || null;
}

export function toCandidateFromRelease(rel: Release, rank = 0): Candidate {
  const artist = artistsDisplay(rel.artists);
  const title = capCodePoints(
    artist ? `${artist} - ${rel.title}` : rel.title,
    MAX_TITLE,
  );
  return {
    releaseId: rel.id,
    rank,
    title,
    artist,
    year: toYear(rel.year),
    country: text(rel.country),
    labels: uniqueStrings((rel.labels ?? []).map((l) => l.name)),
    catno: text(rel.labels?.[0]?.catno),
    formats: toFormats(rel.formats),
    thumbUrl:
      text(rel.thumb, MAX_URL) ?? text(rel.images?.[0]?.uri150, MAX_URL),
    masterId: masterId(rel.master_id),
    stage: 'release',
    catnoMatch: false,
  };
}

/** NFKC, upper case, letters and digits only ('TR-200' === 'tr 200'). */
export function normalizeCatno(s: string | null | undefined): string {
  if (typeof s !== 'string') return '';
  return s
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Stable partition: exact normalized catalog-number matches first, flagged
 * catnoMatch, Discogs order kept within each group; rank renumbered from 0.
 */
export function rankCandidates(
  cands: Candidate[],
  spineCatno: string | null | undefined,
): Candidate[] {
  const want = normalizeCatno(spineCatno);
  const pinned: Candidate[] = [];
  const rest: Candidate[] = [];
  for (const c of cands) {
    if (want && normalizeCatno(c.catno) === want) {
      pinned.push({ ...c, catnoMatch: true });
    } else {
      rest.push({ ...c, catnoMatch: false });
    }
  }
  return [...pinned, ...rest].map((c, rank) => ({ ...c, rank }));
}

export type CascadeSearch = {
  search(params: SearchParams, signal?: AbortSignal): Promise<ParsedSearch>;
};

export type CascadeResult =
  | { stage: Stage['stage']; results: SearchResult[]; total: number }
  | { stage: null; results: []; total: 0 };

/** Runs the stages in order and stops at the first with any result (D-09). */
export async function runCascade(
  inputs: SearchInputs,
  api: CascadeSearch,
  signal?: AbortSignal,
): Promise<CascadeResult> {
  for (const s of buildStages(inputs)) {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const { results, total } = await api.search(s.params, signal);
    if (results.length > 0) {
      return { stage: s.stage, results: results.slice(0, PER_PAGE), total };
    }
  }
  return { stage: null, results: [], total: 0 };
}
