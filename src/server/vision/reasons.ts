import 'server-only';
import { VISION_ERROR_KINDS } from './parse';

// Error-reason copy shown for a failed scan (UI-SPEC Copywriting Contract).
// Kept verbatim; only the fallback carries a server-side short reason.

export const SCAN_ERROR_KINDS = [
  ...VISION_ERROR_KINDS,
  'heic_decode',
  'image_unreadable',
  'too_large',
] as const;
export type ScanErrorKind = (typeof SCAN_ERROR_KINDS)[number];

const SHORT_REASON_MAX = 160;

const FIXED: Partial<Record<ScanErrorKind, string>> = {
  heic_decode:
    "Couldn't decode this HEIC photo. Set your iPhone camera to Most Compatible (Settings › Camera › Formats) or export it as JPEG, then upload it again.",
  refused:
    'Claude declined to read this photo. Re-scan to try again, or upload a different photo.',
  truncated:
    "Claude's answer was cut off before every spine was returned. Photograph a narrower section, or re-scan.",
  schema_invalid:
    "Claude's answer wasn't in the expected format. Re-scan to try again.",
  timeout:
    'Reading the photo took longer than 10 minutes and was stopped. Re-scan to try again.',
  interrupted:
    'The app stopped while Claude was reading this photo. Re-scan to try again.',
  cli_unavailable:
    "The Claude CLI isn't available. Check the Claude CLI card in Settings, then re-scan.",
  image_unreadable:
    "This file couldn't be read as an image. Export it again as JPEG and upload it.",
};

/** Whitespace collapsed, cut to 160 characters. */
export function shortReason(detail: string | undefined): string {
  const t = (detail ?? '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, SHORT_REASON_MAX).join('');
}

/** UI copy for a failed run; failed and too_large use the fallback line. */
export function reasonFor(kind: ScanErrorKind, detail?: string): string {
  const fixed = FIXED[kind];
  if (fixed) return fixed;
  const short =
    shortReason(detail) ||
    (kind === 'too_large' ? 'the photo is too large' : 'unknown error');
  return `Scan failed: ${short}. Re-scan to try again.`;
}
