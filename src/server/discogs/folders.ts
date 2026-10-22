import 'server-only';
import { z } from 'zod';
import { getSetting } from '../settings';

// The collection folder new imports go to (D-03, IMP-02). The folder id is a
// non-secret setting; the folder list read from Discogs is cached in the
// settings table too. Each import records the folder it used, so changing
// the setting never moves an existing import. Plan 04-06 adds the refresh
// from Discogs and the setter.

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
