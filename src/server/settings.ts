import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { VisionModelId } from '@/lib/claude-types';
import { canonicalCountry } from '@/lib/pressing';
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_DENSITY_MAX_SPINES,
  DEFAULT_DENSITY_MIN_SHORT_SIDE_PX,
  DEFAULT_VISION_EFFORT,
  VISION_EFFORTS,
  type VisionEffort,
} from '@/lib/vision-contract';
import { getDb } from './db/client';
import { settings } from './db/schema';

// Non-secret settings (D-08). Values are JSON in the settings table, so they
// travel with the data folder. No secret is ever stored here.

// The model list lives in @/lib/claude-types (client-safe, Phase 5) and is
// re-exported here so server imports are unchanged.
export { VISION_MODELS, type VisionModelId } from '@/lib/claude-types';
export const DEFAULT_VISION_MODEL: VisionModelId = 'claude-opus-5-5';

export const VisionModelSchema = z.enum([
  'claude-opus-5-5',
  'claude-sonnet-5-5',
]);

const VISION_MODEL_KEY = 'vision_model';

/** Parsed value, or null when the key is missing or fails the schema. */
export function getSetting<T>(key: string, schema: z.ZodType<T>): T | null {
  const row = getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  if (!row) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(row.value);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function setSetting(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  const now = Date.now();
  getDb()
    .insert(settings)
    .values({ key, value: json, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: json, updatedAt: now },
    })
    .run();
}

export function getVisionModel(): VisionModelId {
  return (
    getSetting(VISION_MODEL_KEY, VisionModelSchema) ?? DEFAULT_VISION_MODEL
  );
}

/** Throws on any id outside VISION_MODELS. */
export function setVisionModel(id: string): void {
  setSetting(VISION_MODEL_KEY, VisionModelSchema.parse(id));
}

// Vision settings frozen in Plan 02-04 (D-01, D-03). Defaults come from the
// vision contract; a stored value outside its schema falls back to them.

const VISION_EFFORT_KEY = 'vision_effort';
const CONFIDENCE_THRESHOLD_KEY = 'confidence_threshold';
const DENSITY_MAX_SPINES_KEY = 'density_max_spines';
const DENSITY_MIN_SHORT_SIDE_PX_KEY = 'density_min_short_side_px';

export const VisionEffortSchema = z.enum(VISION_EFFORTS);
export const ConfidenceThresholdSchema = z.number().min(0).max(1);
const DensityValueSchema = z.number().int().min(1);

export function getVisionEffort(): VisionEffort {
  return (
    getSetting(VISION_EFFORT_KEY, VisionEffortSchema) ?? DEFAULT_VISION_EFFORT
  );
}

/** Throws on any value outside VISION_EFFORTS. */
export function setVisionEffort(effort: string): void {
  setSetting(VISION_EFFORT_KEY, VisionEffortSchema.parse(effort));
}

export function getConfidenceThreshold(): number {
  return (
    getSetting(CONFIDENCE_THRESHOLD_KEY, ConfidenceThresholdSchema) ??
    DEFAULT_CONFIDENCE_THRESHOLD
  );
}

/** Dense-shelf warning thresholds N (spines) and W (median short side px). */
export function getDensityThresholds(): {
  maxSpines: number;
  minShortSidePx: number;
} {
  return {
    maxSpines:
      getSetting(DENSITY_MAX_SPINES_KEY, DensityValueSchema) ??
      DEFAULT_DENSITY_MAX_SPINES,
    minShortSidePx:
      getSetting(DENSITY_MIN_SHORT_SIDE_PX_KEY, DensityValueSchema) ??
      DEFAULT_DENSITY_MIN_SHORT_SIDE_PX,
  };
}

// Preferred country (D-14): bulk import picks this country's pressing of
// each top match. Stored in Discogs' exact spelling, because the versions
// filter is case-sensitive (RESEARCH Pitfall 1).

export const PREFERRED_COUNTRY_KEY = 'preferred_country';
export const DEFAULT_PREFERRED_COUNTRY = 'Canada';
export const PreferredCountrySchema = z.string().trim().min(1).max(40);

export function getPreferredCountry(): string {
  return (
    getSetting(PREFERRED_COUNTRY_KEY, PreferredCountrySchema) ??
    DEFAULT_PREFERRED_COUNTRY
  );
}

/**
 * Stores and returns Discogs' spelling of the country ("canada" -> "Canada").
 * Throws on an empty value or one over 40 characters; nothing is stored.
 */
export function setPreferredCountry(input: string): string {
  const parsed = PreferredCountrySchema.parse(input);
  const stored = canonicalCountry(parsed) ?? parsed;
  setSetting(PREFERRED_COUNTRY_KEY, stored);
  return stored;
}

// Fallback country (G-06-side-1): when Discogs lists no CD pressing from the
// preferred country, bulk import tries this country's CD pressing next.
// Stored in Discogs' exact spelling, because the versions filter is
// case-sensitive (RESEARCH Pitfall 1). It may equal the preferred country,
// which simply means no second tier (distinctFallback decides that).

export const FALLBACK_COUNTRY_KEY = 'fallback_country';
export const DEFAULT_FALLBACK_COUNTRY = 'US';

export function getFallbackCountry(): string {
  return (
    getSetting(FALLBACK_COUNTRY_KEY, PreferredCountrySchema) ??
    DEFAULT_FALLBACK_COUNTRY
  );
}

/**
 * Stores and returns Discogs' spelling of the country ("usa" -> "US").
 * Throws on an empty value or one over 40 characters; nothing is stored.
 */
export function setFallbackCountry(input: string): string {
  const parsed = PreferredCountrySchema.parse(input);
  const stored = canonicalCountry(parsed) ?? parsed;
  setSetting(FALLBACK_COUNTRY_KEY, stored);
  return stored;
}
