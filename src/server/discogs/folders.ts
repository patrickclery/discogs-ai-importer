import 'server-only';
import { z } from 'zod';
import { getSetting, setSetting } from '../settings';
import { getDiscogsAuth } from './auth';
import {
  type DiscogsFetchDeps,
  DiscogsRequestError,
  discogsFetch,
} from './client';
import { FoldersResponseSchema, foldersPath } from './collection';

// The collection folder new imports go to (D-03, IMP-02). The folder id is a
// non-secret setting; the folder list read from Discogs is cached in the
// settings table too. Each import records the folder it used, so changing
// the setting never moves an existing import.

export const COLLECTION_FOLDER_KEY = 'collection_folder_id';
export const FOLDERS_CACHE_KEY = 'discogs_folders';

/** Uncategorized: the default, and the fallback for a vanished folder. */
export const DEFAULT_FOLDER_ID = 1;

export const FolderSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().max(200),
  count: z.number().int().min(0),
});
export type Folder = z.infer<typeof FolderSchema>;

export const FoldersCacheSchema = z.object({
  folders: z.array(FolderSchema),
  fetchedAt: z.number().int(),
});
export type FoldersCache = z.infer<typeof FoldersCacheSchema>;

const FolderIdSchema = z.number().int().min(1);

/** The cached folder list (folder 0 excluded), or null when never read. */
export function getCachedFolders(): FoldersCache | null {
  return getSetting(FOLDERS_CACHE_KEY, FoldersCacheSchema);
}

/**
 * The folder a new import goes to: the saved id when there is no cached
 * list or the list still has it, otherwise 1 (Uncategorized), so a folder
 * deleted on Discogs falls back instead of failing the add.
 */
export function getCollectionFolderId(): number {
  const saved = getSetting(COLLECTION_FOLDER_KEY, FolderIdSchema);
  if (saved === null) return DEFAULT_FOLDER_ID;
  const cache = getCachedFolders();
  if (!cache || cache.folders.some((f) => f.id === saved)) return saved;
  return DEFAULT_FOLDER_ID;
}

/** The folder's display name: cached name, Uncategorized for 1, else Folder {id}. */
export function collectionFolderName(id: number): string {
  const cached = getCachedFolders()?.folders.find((f) => f.id === id);
  if (cached) return cached.name;
  return id === DEFAULT_FOLDER_ID ? 'Uncategorized' : `Folder ${id}`;
}

/**
 * One signed GET of the owner's folders through the shared pacing gate
 * (RESEARCH Pattern 6, Open Question 1). Folder 0 "All" is read-only and is
 * dropped, as is any entry outside FolderSchema; the rest keep Discogs'
 * order. The list is cached under FOLDERS_CACHE_KEY and returned.
 */
export async function refreshFolders(
  deps: DiscogsFetchDeps = {},
): Promise<Folder[]> {
  const auth = getDiscogsAuth();
  if (!auth) throw new Error('Discogs is not connected');
  const res = await discogsFetch(
    { path: foldersPath(auth.username), auth: 'oauth' },
    deps,
  );
  const parsed = FoldersResponseSchema.safeParse(res.json);
  if (!parsed.success) {
    throw new DiscogsRequestError('Discogs answered without a folder list');
  }
  const folders: Folder[] = [];
  for (const f of parsed.data.folders) {
    const one = FolderSchema.safeParse({
      id: f.id,
      name: f.name,
      count: f.count,
    });
    if (one.success) folders.push(one.data);
  }
  setSetting(FOLDERS_CACHE_KEY, {
    folders,
    fetchedAt: Date.now(),
  } satisfies FoldersCache);
  return folders;
}

/**
 * Saves the folder new imports go to (T-04-22): an integer of at least 1
 * that the cached list holds. Anything else throws and stores nothing.
 */
export function setCollectionFolderId(id: number): void {
  const parsed = FolderIdSchema.safeParse(id);
  const cache = getCachedFolders();
  if (!parsed.success || !cache?.folders.some((f) => f.id === parsed.data)) {
    throw new Error('that folder is not in your Discogs folder list');
  }
  setSetting(COLLECTION_FOLDER_KEY, parsed.data);
}

export type FolderState = {
  folders: Folder[];
  /** The folder new imports go to now (getCollectionFolderId). */
  selectedId: number;
  /** The stored choice, or null when nothing valid is stored. */
  savedId: number | null;
  /** A cached list exists and no longer holds the stored choice. */
  savedMissing: boolean;
  /** When the cached list was read, or null when never read. */
  fetchedAt: number | null;
};

/** What the Settings folder field shows, from the settings table only. */
export function folderState(): FolderState {
  const cache = getCachedFolders();
  const savedId = getSetting(COLLECTION_FOLDER_KEY, FolderIdSchema);
  return {
    folders: cache?.folders ?? [],
    selectedId: getCollectionFolderId(),
    savedId,
    savedMissing:
      cache !== null &&
      savedId !== null &&
      !cache.folders.some((f) => f.id === savedId),
    fetchedAt: cache?.fetchedAt ?? null,
  };
}
