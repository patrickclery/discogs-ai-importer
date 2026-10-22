import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getSetting, setSetting } from '@/server/settings';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import {
  COLLECTION_FOLDER_KEY,
  collectionFolderName,
  FOLDERS_CACHE_KEY,
  folderState,
  getCollectionFolderId,
  setCollectionFolderId,
} from './folders';

// Folder rules (D-03, IMP-02, T-04-22): nothing saved goes to 1; a saved
// folder a fresh list no longer holds falls back to 1; only an integer of at
// least 1 that the cached list holds can be saved.

function cache(folders: { id: number; name: string; count: number }[]) {
  setSetting(FOLDERS_CACHE_KEY, { folders, fetchedAt: 1_700_000_000_000 });
}

const UNCATEGORIZED = { id: 1, name: 'Uncategorized', count: 4 };
const JAZZ = { id: 2, name: 'jazz  (Vinyl & CD)', count: 3 };

describe('getCollectionFolderId', () => {
  useTempDataDir();

  it('no setting and no cache gives 1', () => {
    expect(getCollectionFolderId()).toBe(1);
  });

  it('saved 2 with no cache gives 2', () => {
    setSetting(COLLECTION_FOLDER_KEY, 2);
    expect(getCollectionFolderId()).toBe(2);
  });

  it('saved 2 with a cache listing 2 gives 2', () => {
    cache([UNCATEGORIZED, JAZZ]);
    setSetting(COLLECTION_FOLDER_KEY, 2);
    expect(getCollectionFolderId()).toBe(2);
  });

  it('saved 2 with a cache without 2 gives 1', () => {
    cache([UNCATEGORIZED]);
    setSetting(COLLECTION_FOLDER_KEY, 2);
    expect(getCollectionFolderId()).toBe(1);
  });

  it.each([
    ['0', 0],
    ['a fraction', 1.5],
    ['a negative', -3],
    ['a string', '2'],
    ['null', null],
  ])('a stored %s is ignored and gives 1', (_label, value) => {
    setSetting(COLLECTION_FOLDER_KEY, value);
    expect(getCollectionFolderId()).toBe(1);
  });
});

describe('collectionFolderName', () => {
  useTempDataDir();

  it('1 without a cache gives Uncategorized', () => {
    expect(collectionFolderName(1)).toBe('Uncategorized');
  });

  it('a cached id gives its name verbatim', () => {
    cache([UNCATEGORIZED, JAZZ]);
    expect(collectionFolderName(2)).toBe('jazz  (Vinyl & CD)');
  });

  it('an unknown id gives Folder {id}', () => {
    cache([UNCATEGORIZED]);
    expect(collectionFolderName(7)).toBe('Folder 7');
  });
});

describe('setCollectionFolderId', () => {
  useTempDataDir();

  it.each([
    ['0', 0],
    ['-1', -1],
    ['1.5', 1.5],
    ['NaN', Number.NaN],
    ['an id missing from the cache', 9],
  ])('%s throws and stores nothing', (_label, id) => {
    cache([UNCATEGORIZED, JAZZ]);
    expect(() => setCollectionFolderId(id)).toThrow(
      'that folder is not in your Discogs folder list',
    );
    expect(getSetting(COLLECTION_FOLDER_KEY, z.unknown())).toBeNull();
  });

  it('throws without a cached list, even for 1', () => {
    expect(() => setCollectionFolderId(1)).toThrow();
    expect(getCollectionFolderId()).toBe(1);
  });

  it('stores a cached id', () => {
    cache([UNCATEGORIZED, JAZZ]);
    setCollectionFolderId(2);
    expect(getCollectionFolderId()).toBe(2);
    expect(folderState().savedId).toBe(2);
  });
});

describe('folderState', () => {
  useTempDataDir();

  it('empty: no cache, nothing saved, folder 1, not missing', () => {
    expect(folderState()).toEqual({
      folders: [],
      selectedId: 1,
      savedId: null,
      savedMissing: false,
      fetchedAt: null,
    });
  });

  it('a list holding only Uncategorized is listed as one folder', () => {
    cache([UNCATEGORIZED]);
    expect(folderState().folders).toEqual([UNCATEGORIZED]);
  });

  it('keeps the cached order', () => {
    const ambient = { id: 3, name: 'Ambient', count: 0 };
    cache([JAZZ, UNCATEGORIZED, ambient]);
    expect(folderState().folders.map((f) => f.id)).toEqual([2, 1, 3]);
  });

  it('savedMissing is false with a saved id and no cache', () => {
    setSetting(COLLECTION_FOLDER_KEY, 2);
    expect(folderState()).toMatchObject({
      savedId: 2,
      selectedId: 2,
      savedMissing: false,
    });
  });

  it('savedMissing is false when the cache holds the saved id', () => {
    cache([UNCATEGORIZED, JAZZ]);
    setSetting(COLLECTION_FOLDER_KEY, 2);
    expect(folderState().savedMissing).toBe(false);
  });

  it('savedMissing is true when a cache exists without the saved id', () => {
    cache([UNCATEGORIZED]);
    setSetting(COLLECTION_FOLDER_KEY, 2);
    expect(folderState()).toMatchObject({
      savedId: 2,
      selectedId: 1,
      savedMissing: true,
    });
  });

  it('savedMissing is false with a cache and nothing saved', () => {
    cache([UNCATEGORIZED]);
    expect(folderState().savedMissing).toBe(false);
  });
});
