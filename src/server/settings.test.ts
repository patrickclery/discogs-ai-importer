import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useTempDataDir } from '../../test/helpers/temp-data-dir';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { saveVisionModel } from '@/app/settings/actions';
import { closeDb, getDb } from './db/client';
import {
  DEFAULT_VISION_MODEL,
  getConfidenceThreshold,
  getDensityThresholds,
  getSetting,
  getVisionEffort,
  getVisionModel,
  setSetting,
  setVisionEffort,
  setVisionModel,
  VISION_MODELS,
} from './settings';

function rawRow(
  key: string,
): { value: string; updated_at: number } | undefined {
  return getDb()
    .$client.prepare('SELECT value, updated_at FROM settings WHERE key = ?')
    .get(key) as { value: string; updated_at: number } | undefined;
}

describe('settings', () => {
  useTempDataDir();

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it('offers exactly Opus 5.5 (default) and Sonnet 5.5', () => {
    expect(VISION_MODELS.map((m) => m.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ]);
    expect(DEFAULT_VISION_MODEL).toBe('claude-opus-5-5');
  });

  it('getVisionModel returns claude-opus-5-5 on an empty settings table', () => {
    expect(getVisionModel()).toBe('claude-opus-5-5');
  });

  it('setVisionModel stores the JSON string with updated_at and survives a reopen', () => {
    const before = Date.now();
    setVisionModel('claude-sonnet-5-5');
    const row = rawRow('vision_model');
    expect(row?.value).toBe('"claude-sonnet-5-5"');
    expect(row?.updated_at).toBeGreaterThanOrEqual(before);
    expect(getVisionModel()).toBe('claude-sonnet-5-5');
    closeDb();
    expect(getVisionModel()).toBe('claude-sonnet-5-5');
  });

  it('setVisionModel rejects claude-haiku-4-5 and leaves the stored value unchanged', () => {
    setVisionModel('claude-sonnet-5-5');
    expect(() => setVisionModel('claude-haiku-4-5')).toThrow();
    expect(rawRow('vision_model')?.value).toBe('"claude-sonnet-5-5"');
  });

  it('a stored value outside VISION_MODELS reads back as the default', () => {
    getDb()
      .$client.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      )
      .run('vision_model', '"claude-haiku-4-5"', Date.now());
    expect(getVisionModel()).toBe(DEFAULT_VISION_MODEL);
  });

  it('getSetting returns null for a missing key and for a value failing the schema', () => {
    expect(getSetting('missing', z.string())).toBeNull();
    setSetting('n', 42);
    expect(getSetting('n', z.string())).toBeNull();
    expect(getSetting('n', z.number())).toBe(42);
    getDb()
      .$client.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      )
      .run('broken', '{not json', Date.now());
    expect(getSetting('broken', z.unknown())).toBeNull();
  });

  it('setSetting upserts an existing key', () => {
    setSetting('k', 'a');
    setSetting('k', 'b');
    expect(getSetting('k', z.string())).toBe('b');
  });

  it('saveVisionModel stores a valid id, returns { ok: true } and revalidates /settings', async () => {
    const res = await saveVisionModel('claude-sonnet-5-5');
    expect(res).toEqual({ ok: true });
    expect(getVisionModel()).toBe('claude-sonnet-5-5');
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('saveVisionModel rejects an unknown id with a formError and stores nothing', async () => {
    const res = await saveVisionModel('nope');
    expect(res.ok).toBe(false);
    expect(res.ok ? '' : res.formError).toBeTruthy();
    expect(rawRow('vision_model')).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('vision settings default to the values frozen at the 02-04 checkpoint', () => {
    expect(getVisionEffort()).toBe('high');
    expect(getConfidenceThreshold()).toBe(0.6);
    expect(getDensityThresholds()).toEqual({
      maxSpines: 90,
      minShortSidePx: 33,
    });
  });

  it('setVisionEffort stores a valid effort and rejects an unknown one', () => {
    setVisionEffort('medium');
    expect(getVisionEffort()).toBe('medium');
    expect(() => setVisionEffort('turbo')).toThrow();
    expect(getVisionEffort()).toBe('medium');
  });

  it('out-of-range thresholds read back as the defaults', () => {
    setSetting('confidence_threshold', 1.5);
    setSetting('density_max_spines', 0);
    setSetting('density_min_short_side_px', 12.5);
    expect(getConfidenceThreshold()).toBe(0.6);
    expect(getDensityThresholds()).toEqual({
      maxSpines: 90,
      minShortSidePx: 33,
    });
    setSetting('confidence_threshold', 0.4);
    setSetting('density_max_spines', 45);
    expect(getConfidenceThreshold()).toBe(0.4);
    expect(getDensityThresholds().maxSpines).toBe(45);
  });
});
