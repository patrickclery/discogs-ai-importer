import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useTempDataDir } from '../../test/helpers/temp-data-dir';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { saveVisionModel } from '@/app/settings/actions';
import { closeDb, getDb } from './db/client';
import {
  DEFAULT_FALLBACK_COUNTRY,
  DEFAULT_PREFERRED_COUNTRY,
  DEFAULT_VISION_MODEL,
  getConfidenceThreshold,
  getDensityThresholds,
  getFallbackCountry,
  getPreferredCountry,
  getSetting,
  getVisionEffort,
  getVisionModel,
  setFallbackCountry,
  setPreferredCountry,
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

// Preferred country (D-14, RESEARCH Pitfall 1): stored in Discogs' exact
// spelling because the versions filter is case-sensitive.
describe('preferred country', () => {
  useTempDataDir();

  it('getPreferredCountry with no stored row returns Canada', () => {
    expect(DEFAULT_PREFERRED_COUNTRY).toBe('Canada');
    expect(getPreferredCountry()).toBe('Canada');
  });

  it("setPreferredCountry('canada') stores and returns Canada", () => {
    expect(setPreferredCountry('canada')).toBe('Canada');
    expect(rawRow('preferred_country')?.value).toBe('"Canada"');
    expect(getPreferredCountry()).toBe('Canada');
  });

  it('trims an unknown country and stores it as typed', () => {
    expect(setPreferredCountry('  Hong Kong ')).toBe('Hong Kong');
    expect(getPreferredCountry()).toBe('Hong Kong');
    expect(setPreferredCountry('usa')).toBe('US');
    expect(getPreferredCountry()).toBe('US');
  });

  it('an empty or 41-character value throws and stores nothing', () => {
    expect(() => setPreferredCountry('')).toThrow();
    expect(() => setPreferredCountry('   ')).toThrow();
    expect(() => setPreferredCountry('x'.repeat(41))).toThrow();
    expect(rawRow('preferred_country')).toBeUndefined();
    expect(setPreferredCountry('y'.repeat(40))).toBe('y'.repeat(40));
  });

  it('a stored value failing the schema reads back as Canada', () => {
    setSetting('preferred_country', '');
    expect(getPreferredCountry()).toBe('Canada');
    setSetting('preferred_country', 7);
    expect(getPreferredCountry()).toBe('Canada');
  });
});

// Fallback country (G-06-side-1): the second tier bulk import tries, stored
// under its own key in Discogs' spelling, like the preferred country.
describe('fallback country', () => {
  useTempDataDir();

  it('getFallbackCountry with no stored row returns US', () => {
    expect(DEFAULT_FALLBACK_COUNTRY).toBe('US');
    expect(getFallbackCountry()).toBe('US');
  });

  it("setFallbackCountry('usa') stores and returns US", () => {
    expect(setFallbackCountry('usa')).toBe('US');
    expect(rawRow('fallback_country')?.value).toBe('"US"');
    expect(getFallbackCountry()).toBe('US');
  });

  it("canonicalizes 'united kingdom' and trims an unknown country", () => {
    expect(setFallbackCountry('united kingdom')).toBe('UK');
    expect(getFallbackCountry()).toBe('UK');
    expect(setFallbackCountry('  Hong Kong ')).toBe('Hong Kong');
    expect(getFallbackCountry()).toBe('Hong Kong');
  });

  it('an empty or 41-character value throws and stores nothing', () => {
    expect(() => setFallbackCountry('')).toThrow();
    expect(() => setFallbackCountry('   ')).toThrow();
    expect(() => setFallbackCountry('x'.repeat(41))).toThrow();
    expect(rawRow('fallback_country')).toBeUndefined();
  });

  it('is independent of the preferred country', () => {
    setFallbackCountry('Germany');
    expect(getPreferredCountry()).toBe('Canada');
    expect(rawRow('preferred_country')).toBeUndefined();
    setPreferredCountry('Japan');
    expect(getFallbackCountry()).toBe('Germany');
  });
});
