import { describe, expect, it } from 'vitest';
import { reasonFor, SCAN_ERROR_KINDS } from './reasons';

describe('reasonFor', () => {
  it('covers every vision error kind plus the image decode kinds', () => {
    expect(SCAN_ERROR_KINDS).toEqual([
      'cli_unavailable',
      'timeout',
      'interrupted',
      'truncated',
      'refused',
      'schema_invalid',
      'failed',
      'heic_decode',
      'image_unreadable',
      'too_large',
    ]);
    for (const kind of SCAN_ERROR_KINDS) {
      expect(reasonFor(kind, 'x').length).toBeGreaterThan(10);
    }
  });

  it('returns the UI-SPEC copy verbatim for fixed kinds', () => {
    expect(reasonFor('timeout')).toBe(
      'Reading the photo took longer than 10 minutes and was stopped. Re-scan to try again.',
    );
    expect(reasonFor('cli_unavailable', 'ignored')).toBe(
      "The Claude CLI isn't available. Check the Claude CLI card in Settings, then re-scan.",
    );
  });

  it('uses the fallback for failed and too_large, cut to 160 characters', () => {
    expect(reasonFor('failed', '  Overloaded\n  ')).toBe(
      'Scan failed: Overloaded. Re-scan to try again.',
    );
    const long = 'a'.repeat(400);
    const r = reasonFor('too_large', long);
    expect(r).toBe(`Scan failed: ${'a'.repeat(160)}. Re-scan to try again.`);
  });
});
