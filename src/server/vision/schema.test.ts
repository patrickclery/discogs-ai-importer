import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/lib/vision-contract';
import { visionJsonSchema } from './schema';

// D-01 freeze gate (Plan 02-04). The schema sent with --json-schema is frozen:
// stored runs, recorded fixtures and every spine's fields depend on it. A
// change here means paid re-scans, so it must be a deliberate new
// SCHEMA_VERSION with a new frozen file, never an accidental edit.

const FROZEN = path.join(
  import.meta.dirname,
  '../../../test/fixtures/vision/vision-schema.frozen.json',
);

describe('vision schema freeze', () => {
  it('matches the frozen JSON schema exactly', () => {
    const frozen: unknown = JSON.parse(fs.readFileSync(FROZEN, 'utf8'));
    expect(visionJsonSchema).toEqual(frozen);
  });

  it('is schema version 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
