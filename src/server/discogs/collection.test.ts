import { describe, expect, it } from 'vitest';
import type { ExistingInstance } from '@/lib/import-types';
import {
  ADOPT_SKEW_MS,
  CollectionReleasesSchema,
  foreignInstances,
  pickAdoptable,
  toInstances,
} from './collection';

// The adopt and hold rules (D-05, D-07, IMP-03, IMP-04, T-04-10): adopt only
// a copy this app's own POST could have made (absent from the pre-POST
// snapshot, recorded on no import, dated at or after the intent minus the
// skew); everything else is the owner's and is held for their decision.

/** 2026-10-22T12:00:00.500Z, with milliseconds so the boundary is exact. */
const INTENT = Date.UTC(2026, 9, 22, 12, 0, 0, 500);

const iso = (ms: number) => new Date(ms).toISOString();

const copy = (
  instanceId: number,
  dateAdded: string,
  folderId = 1,
): ExistingInstance => ({ instanceId, folderId, dateAdded });

const none = new Set<number>();

function adopt(
  instances: ExistingInstance[],
  opts: { snapshot?: number[]; recorded?: number[]; complete?: boolean } = {},
): number | null {
  return (
    pickAdoptable(instances, {
      intentAt: INTENT,
      snapshot: new Set(opts.snapshot ?? []),
      recorded: new Set(opts.recorded ?? []),
      complete: opts.complete,
    })?.instanceId ?? null
  );
}

describe('pickAdoptable', () => {
  it('the skew is 120 000 ms', () => {
    expect(ADOPT_SKEW_MS).toBe(120_000);
  });

  it('adopts a copy dated exactly intent_at minus 120 000 ms', () => {
    expect(adopt([copy(7001, iso(INTENT - 120_000))])).toBe(7001);
  });

  it('does not adopt a copy dated intent_at minus 120 001 ms', () => {
    expect(adopt([copy(7001, iso(INTENT - 120_001))])).toBeNull();
  });

  it('adopts a copy dated after the intent, in Discogs offset form', () => {
    // 12:00:03 UTC written as 05:00:03-07:00, second resolution.
    expect(adopt([copy(7001, '2026-10-22T05:00:03-07:00')])).toBe(7001);
  });

  it('never adopts a copy listed in the snapshot', () => {
    expect(
      adopt([copy(7001, iso(INTENT + 1_000))], { snapshot: [7001] }),
    ).toBeNull();
  });

  it('never adopts a copy recorded on any import', () => {
    expect(
      adopt([copy(7001, iso(INTENT + 1_000))], { recorded: [7001] }),
    ).toBeNull();
  });

  it.each([
    ['an unparseable date', 'yesterday-ish'],
    ['an empty date', ''],
  ])('never adopts a copy with %s', (_what, date) => {
    expect(adopt([copy(7001, date)])).toBeNull();
  });

  describe('a complete read (one page) compares no dates (WR-04)', () => {
    it('adopts a new copy dated long before the intent: a fast local clock cannot hide it', () => {
      expect(
        adopt([copy(7001, iso(INTENT - 600_000))], { complete: true }),
      ).toBe(7001);
    });

    it('adopts a new copy with an unparseable date', () => {
      expect(adopt([copy(7001, 'yesterday-ish')], { complete: true })).toBe(
        7001,
      );
    });

    it('still never adopts a snapshot or recorded copy', () => {
      expect(
        adopt([copy(7001, iso(INTENT)), copy(7002, iso(INTENT))], {
          complete: true,
          snapshot: [7001],
          recorded: [7002],
        }),
      ).toBeNull();
    });
  });

  it('with two new copies adopts the lower instance_id (the first add)', () => {
    expect(
      adopt([copy(7003, iso(INTENT + 2_000)), copy(7002, iso(INTENT + 1_000))]),
    ).toBe(7002);
  });

  it('skips excluded copies and adopts the lowest remaining one', () => {
    expect(
      adopt(
        [
          copy(7001, iso(INTENT + 1_000)),
          copy(7002, iso(INTENT + 1_000)),
          copy(7003, iso(INTENT + 1_000)),
        ],
        { snapshot: [7001], recorded: [7002] },
      ),
    ).toBe(7003);
  });

  it('an empty list gives null', () => {
    expect(adopt([])).toBeNull();
  });
});

describe('foreignInstances', () => {
  it('drops recorded ids and keeps the rest by ascending instance_id', () => {
    const out = foreignInstances(
      [
        copy(9003, '2017-01-01T00:00:00-08:00'),
        copy(9001, '2015-11-30T10:54:13-08:00', 3),
        copy(7001, iso(INTENT)),
        copy(9002, '2016-01-02T10:00:00-08:00'),
      ],
      new Set([7001]),
    );
    expect(out.map((i) => i.instanceId).join(' ')).toBe('9001 9002 9003');
    expect(out[0]).toEqual(copy(9001, '2015-11-30T10:54:13-08:00', 3));
  });

  it('an empty list or every copy recorded gives no foreign copy', () => {
    expect(foreignInstances([], none)).toEqual([]);
    expect(
      foreignInstances([copy(7001, iso(INTENT))], new Set([7001])),
    ).toEqual([]);
  });

  it('does not reorder or change its input', () => {
    const input = [copy(9002, 'b'), copy(9001, 'a')];
    foreignInstances(input, none);
    expect(input.map((i) => i.instanceId)).toEqual([9002, 9001]);
  });
});

function answer(releases: unknown[], pages = 1) {
  return {
    pagination: {
      page: 1,
      pages,
      per_page: 50,
      items: releases.length,
      urls: {},
    },
    releases,
  };
}

const owned = (instanceId: number, folderId = 1, extra = {}) => ({
  id: 1002,
  instance_id: instanceId,
  folder_id: folderId,
  date_added: '2015-11-30T10:54:13-08:00',
  rating: 4,
  basic_information: { id: 1002, title: 'Blue Hour' },
  ...extra,
});

describe('toInstances and CollectionReleasesSchema', () => {
  it('sorts copies by ascending instance_id', () => {
    const parsed = CollectionReleasesSchema.parse(
      answer([owned(9003), owned(9001), owned(9002)]),
    );
    expect(toInstances(parsed).map((i) => i.instanceId)).toEqual([
      9001, 9002, 9003,
    ]);
  });

  it('keeps a folder_id 0 copy as listed', () => {
    const parsed = CollectionReleasesSchema.parse(answer([owned(9001, 0)]));
    expect(toInstances(parsed)).toEqual([
      { instanceId: 9001, folderId: 0, dateAdded: '2015-11-30T10:54:13-08:00' },
    ]);
  });

  it('tolerates extra keys on the answer and on each copy', () => {
    const result = CollectionReleasesSchema.safeParse({
      ...answer([owned(9001, 1, { notes: [{ field_id: 1, value: 'x' }] })]),
      extra: true,
    });
    expect(result.success).toBe(true);
  });

  it.each([0, -5, 1.5])('rejects a copy with instance_id %s', (instanceId) => {
    expect(
      CollectionReleasesSchema.safeParse(answer([owned(instanceId)])).success,
    ).toBe(false);
  });

  it('parses the live empty answer (not owned, or no such release) to no copy', () => {
    const parsed = CollectionReleasesSchema.parse({
      pagination: { page: 1, pages: 1, per_page: 50, items: 0, urls: {} },
      releases: [],
    });
    expect(toInstances(parsed)).toEqual([]);
  });

  it('accepts an answer with more than one page and reads the first page only (A6)', () => {
    const parsed = CollectionReleasesSchema.parse(answer([owned(9001)], 3));
    expect(parsed.pagination.pages).toBe(3);
    expect(toInstances(parsed).map((i) => i.instanceId)).toEqual([9001]);
  });
});
