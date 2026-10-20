import 'server-only';
import { z } from 'zod';
import {
  LEGIBILITY_LEVELS,
  MEDIA_KINDS,
  TEXT_ORIENTATIONS,
} from '@/lib/vision-contract';

// Vision output schema (D-01 freeze candidate, VIS-02). The JSON schema sent
// with --json-schema carries no numeric, length or item bounds: a validation
// failure makes the CLI re-prompt and spend quota (RESEARCH Anti-Patterns).
// Ranges are enforced in code (parse.ts, crop.ts) instead.

export const FieldRead = z.object({
  value: z.string().nullable(),
  confidence: z.number(),
});
export type FieldRead = z.infer<typeof FieldRead>;

export const SpineRead = z.object({
  index: z.number(),
  media_kind: z.enum(MEDIA_KINDS),
  /** [x1, y1, x2, y2] integer pixels in the image Claude saw. */
  bbox: z.array(z.number()),
  text_orientation: z.enum(TEXT_ORIENTATIONS),
  legibility: z.enum(LEGIBILITY_LEVELS),
  raw_text: FieldRead,
  artist: FieldRead,
  title: FieldRead,
  format: FieldRead,
  label: FieldRead,
  catalog_number: FieldRead,
});
export type SpineRead = z.infer<typeof SpineRead>;

export const VisionResult = z.object({
  image_width: z.number(),
  image_height: z.number(),
  spine_count_estimate: z.number(),
  spines: z.array(SpineRead),
});
export type VisionResult = z.infer<typeof VisionResult>;

const BOUND_KEYS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
]);

function stripBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripBounds);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (!BOUND_KEYS.has(k)) out[k] = stripBounds(v);
    }
    return out;
  }
  return node;
}

export const visionJsonSchema = stripBounds(
  z.toJSONSchema(VisionResult, { target: 'draft-07' }),
) as Record<string, unknown>;

/** The `claude -p --output-format json` result envelope. */
export const CliEnvelope = z.object({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  total_cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  num_turns: z.number().optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});
export type CliEnvelope = z.infer<typeof CliEnvelope>;
