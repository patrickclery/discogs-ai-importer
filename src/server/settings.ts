import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from './db/client';
import { settings } from './db/schema';

// Non-secret settings (D-08). Values are JSON in the settings table, so they
// travel with the data folder. No secret is ever stored here.

// Haiku is excluded: its 1568 px image cap makes spine text illegible.
export const VISION_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
] as const;
export type VisionModelId = (typeof VISION_MODELS)[number]['id'];
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
