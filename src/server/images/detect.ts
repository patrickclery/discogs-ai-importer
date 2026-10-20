import 'server-only';
import type { ImageKind } from './normalize';

// Upload type detection from magic bytes only (D-06, T-02-05). The declared
// Content-Type is never trusted for the kind.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
  'heif',
]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== 'ftyp') return false;
  const boxSize =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  if (HEIF_BRANDS.has(ascii(bytes, 8, 12))) return true;
  // Compatible brands follow the 4-byte minor version, up to the box end.
  const end = Math.min(boxSize, bytes.length);
  for (let i = 16; i + 4 <= end; i += 4) {
    if (HEIF_BRANDS.has(ascii(bytes, i, i + 4))) return true;
  }
  return false;
}

export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((b, i) => bytes[i] === b)
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (isHeif(bytes)) return 'heic';
  return null;
}

export function extensionFor(kind: ImageKind): string {
  return kind === 'jpeg' ? 'jpg' : kind;
}

export function mimeFor(kind: ImageKind): string {
  return `image/${kind}`;
}
