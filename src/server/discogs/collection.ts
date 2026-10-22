import 'server-only';
import { z } from 'zod';
import type { ExistingInstance } from '@/lib/import-types';

// The owner's Discogs collection as the add_to_collection job reads it
// (D-05, D-07, RESEARCH "Discogs API Facts"): response schemas, path
// builders and the pure adopt and foreign rules. No request is sent here.

export const CollectionReleasesSchema = z.object({
  pagination: z.object({ pages: z.number(), items: z.number() }).passthrough(),
  releases: z.array(
    z
      .object({
        instance_id: z.number().int().positive(),
        folder_id: z.number().int().min(0),
        date_added: z.string(),
        id: z.number().int(),
      })
      .passthrough(),
  ),
});
export type CollectionReleases = z.infer<typeof CollectionReleasesSchema>;

/** 201 answer of the add POST. */
export const AddResponseSchema = z
  .object({ instance_id: z.number().int().positive() })
  .passthrough();

export const FoldersResponseSchema = z.object({
  folders: z.array(
    z.object({
      id: z.number().int().min(0),
      name: z.string(),
      count: z.number().int().min(0),
    }),
  ),
});

/**
 * date_added has one-second resolution and the two clocks may differ; the
 * snapshot is the primary adopt rule, this margin only a secondary guard.
 */
export const ADOPT_SKEW_MS = 120_000;

function positiveInt(n: number, what: string, min = 1): void {
  if (!Number.isSafeInteger(n) || n < min) {
    throw new Error(`${what} must be an integer of at least ${min}`);
  }
}

function userSegment(username: string): string {
  if (!username) throw new Error('username is empty');
  return encodeURIComponent(username);
}

export function collectionReleasesPath(
  username: string,
  releaseId: number,
): string {
  positiveInt(releaseId, 'release id');
  return `/users/${userSegment(username)}/collection/releases/${releaseId}`;
}

export function addToFolderPath(
  username: string,
  folderId: number,
  releaseId: number,
): string {
  positiveInt(folderId, 'folder id');
  positiveInt(releaseId, 'release id');
  return `/users/${userSegment(username)}/collection/folders/${folderId}/releases/${releaseId}`;
}

export function foldersPath(username: string): string {
  return `/users/${userSegment(username)}/collection/folders`;
}

/** The copies in a parsed answer, by ascending instance id. */
export function toInstances(parsed: CollectionReleases): ExistingInstance[] {
  return parsed.releases
    .map((r) => ({
      instanceId: r.instance_id,
      folderId: r.folder_id,
      dateAdded: r.date_added,
    }))
    .sort((a, b) => a.instanceId - b.instanceId);
}

/**
 * The copy an earlier attempt's POST created, or null: the lowest-numbered
 * copy not in the pre-POST snapshot, not recorded on any import, and dated
 * at or after intentAt minus ADOPT_SKEW_MS. An unparseable date is never
 * adopted (A-04-04).
 */
export function pickAdoptable(
  instances: ExistingInstance[],
  opts: { intentAt: number; snapshot: Set<number>; recorded: Set<number> },
): ExistingInstance | null {
  const hits = instances
    .filter(
      (i) =>
        !opts.snapshot.has(i.instanceId) && !opts.recorded.has(i.instanceId),
    )
    .filter((i) => {
      const t = Date.parse(i.dateAdded);
      return Number.isFinite(t) && t >= opts.intentAt - ADOPT_SKEW_MS;
    })
    .sort((a, b) => a.instanceId - b.instanceId);
  return hits[0] ?? null;
}

/** Copies no import records: the owner's own, or another app's. */
export function foreignInstances(
  instances: ExistingInstance[],
  recorded: Set<number>,
): ExistingInstance[] {
  return instances.filter((i) => !recorded.has(i.instanceId));
}
