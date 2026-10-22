import 'server-only';
import type Database from 'better-sqlite3';
import type { CandidateFormat } from '@/lib/discogs-types';
import {
  canChangeMatchOf,
  canRetryOf,
  IMPORT_ERROR_KINDS,
  type ImportCandidateSnapshot,
  type ImportDto,
  type ImportErrorKind,
  type ImportFailure,
  type ImportStatus,
  importPhaseOf,
} from '@/lib/import-types';
import { collectionFolderName } from '../discogs/folders';
import { capCodePoints } from '../discogs/inputs';
import { CHECK_IMPORT_JOB_TYPE, type ImportDbRow } from './store';

// The import half of the /spines read model (IMP-01, IMP-02, IMP-04, D-03,
// D-05, D-07). One query per page, whatever the spine count: each listed
// spine's latest imports row with its job's status and whether the confirmed
// candidate still exists. Raw SQL with @named parameters and single-quoted
// literals (DQS=0). Only the failure kind, and for kind other the stored
// status-only message cut to 160 code points, reach the browser (T-04-41).

/** Owner-facing failure reasons are cut to this many code points. */
const REASON_MAX = 160;

const LATEST_IMPORTS_SQL = `
  WITH latest AS (
    SELECT i.*,
      ROW_NUMBER() OVER (
        PARTITION BY i.spine_id ORDER BY i.created_at DESC, i.id DESC
      ) AS rn
    FROM imports i
    WHERE i.spine_id IN (SELECT value FROM json_each(@ids))
  )
  SELECT l.*, j.status AS job_status, j.type AS job_type,
    c.id IS NOT NULL AS candidate_exists,
    c.thumb_url IS NOT NULL AS has_thumb
  FROM latest l
  LEFT JOIN jobs j ON j.id = l.job_id
  LEFT JOIN discogs_candidates c
    ON c.id = l.candidate_id AND c.spine_id = l.spine_id
  WHERE l.rn = 1`;

type LatestImportRow = ImportDbRow & {
  job_status: string | null;
  job_type: string | null;
  candidate_exists: number;
  has_thumb: number;
};

function parseJson(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strOrNull(v: unknown): string | null | undefined {
  if (v === null) return null;
  return typeof v === 'string' ? v : undefined;
}

/** candidate_json as a snapshot, or null when absent or malformed (T-04-42). */
function parseCandidate(json: string | null): ImportCandidateSnapshot | null {
  const v = parseJson(json);
  if (!isRecord(v) || typeof v.title !== 'string') return null;
  const year =
    v.year === null || typeof v.year === 'number' ? v.year : undefined;
  const country = strOrNull(v.country);
  const catno = strOrNull(v.catno);
  if (year === undefined || country === undefined || catno === undefined) {
    return null;
  }
  if (!Array.isArray(v.labels) || !Array.isArray(v.formats)) return null;
  const labels = v.labels.filter((l): l is string => typeof l === 'string');
  const formats: CandidateFormat[] = [];
  for (const f of v.formats) {
    if (!isRecord(f) || typeof f.name !== 'string') continue;
    formats.push({
      name: f.name,
      qty: typeof f.qty === 'string' ? f.qty : null,
      descriptions: Array.isArray(f.descriptions)
        ? f.descriptions.filter((d): d is string => typeof d === 'string')
        : [],
      text: typeof f.text === 'string' ? f.text : null,
    });
  }
  return { title: v.title, year, country, labels, catno, formats };
}

/** existing_json: the count and the first held copy (D-05), or null. */
function parseExisting(
  json: string | null,
  nameOf: (id: number) => string,
): ImportDto['existing'] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return null;
  const copies = v.filter(
    (c): c is { instanceId: number; folderId: number; dateAdded: string } =>
      isRecord(c) &&
      typeof c.instanceId === 'number' &&
      typeof c.folderId === 'number' &&
      typeof c.dateAdded === 'string',
  );
  const first = copies[0];
  if (!first) return null;
  return {
    count: copies.length,
    folderId: first.folderId,
    folderName: nameOf(first.folderId),
    dateAdded: first.dateAdded,
  };
}

function toErrorKind(v: string | null): ImportErrorKind | null {
  if (v === null) return null;
  return (IMPORT_ERROR_KINDS as readonly string[]).includes(v)
    ? (v as ImportErrorKind)
    : 'other';
}

function failureOf(row: ImportDbRow): ImportFailure {
  // A recorded error kind wins; a pending or importing row read as failed
  // (its job gave up) was interrupted (RESEARCH Pitfall 4).
  const kind =
    toErrorKind(row.error_kind) ??
    (row.status === 'pending' || row.status === 'importing'
      ? 'interrupted'
      : 'other');
  const text = row.error?.trim();
  return {
    kind,
    reason: kind === 'other' && text ? capCodePoints(text, REASON_MAX) : null,
  };
}

/**
 * One imports row as the card sees it. Pure apart from `nameOf` (the folder
 * label lookup, default collectionFolderName), so Plan 04-11 pins it with a
 * table. `folderName` names this import's own folder (D-03).
 */
export function toImportDto(
  row: ImportDbRow,
  opts: {
    jobStatus: string | null;
    /** The job's type; check_import marks Change match checking (CR-01). */
    jobType?: string | null;
    candidateExists: boolean;
    hasThumb: boolean;
    folderName: string;
    nameOf?: (id: number) => string;
  },
): ImportDto {
  const status = row.status as ImportStatus;
  const phase = importPhaseOf({
    status,
    intentAt: row.intent_at,
    jobStatus: opts.jobStatus,
  });
  return {
    id: row.id,
    phase,
    releaseId: row.release_id,
    candidateId: opts.candidateExists ? row.candidate_id : null,
    candidate: parseCandidate(row.candidate_json),
    hasThumb: opts.candidateExists && opts.hasThumb,
    folderId: row.folder_id,
    folderName: opts.folderName,
    instanceId: row.instance_id,
    linked: row.linked === 1,
    adopted: row.adopted === 1,
    importedAt: row.imported_at,
    existing: parseExisting(
      row.existing_json,
      opts.nameOf ?? collectionFolderName,
    ),
    failure: phase === 'failed' ? failureOf(row) : null,
    canChangeMatch: canChangeMatchOf({
      phase,
      intentAt: row.intent_at,
      errorKind: row.error_kind,
      jobStatus: opts.jobStatus,
    }),
    canRetry: canRetryOf(phase),
    checking:
      opts.jobType === CHECK_IMPORT_JOB_TYPE &&
      (phase === 'waiting' || phase === 'importing'),
  };
}

/** Each listed spine's latest import, keyed by spine id. */
export function importsForSpines(
  db: Database.Database,
  spines: readonly { id: string }[],
): Map<string, ImportDto> {
  const out = new Map<string, ImportDto>();
  if (spines.length === 0) return out;
  const ids = JSON.stringify(spines.map((s) => s.id));
  const names = new Map<number, string>();
  const nameOf = (id: number): string => {
    let n = names.get(id);
    if (n === undefined) {
      n = collectionFolderName(id);
      names.set(id, n);
    }
    return n;
  };
  for (const r of db
    .prepare(LATEST_IMPORTS_SQL)
    .all({ ids }) as LatestImportRow[]) {
    out.set(
      r.spine_id,
      toImportDto(r, {
        jobStatus: r.job_status,
        jobType: r.job_type,
        candidateExists: r.candidate_exists === 1,
        hasThumb: r.has_thumb === 1,
        folderName: nameOf(r.folder_id),
        nameOf,
      }),
    );
  }
  return out;
}
