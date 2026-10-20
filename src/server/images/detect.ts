import 'server-only';
import type { ImageKind } from './normalize';

// Upload type detection from magic bytes only (D-06, T-02-05). The declared
// Content-Type is never trusted for the kind.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** HEVC-coded HEIF brands: always HEIC. */
const HEVC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
/** Generic HEIF brands, which AVIF files also list (IN-02). */
const GENERIC_HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** The major brand and every compatible brand of the ftyp box. */
function ftypBrands(bytes: Uint8Array): string[] {
  const boxSize =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const brands = [ascii(bytes, 8, 12)];
  // Compatible brands follow the 4-byte minor version, up to the box end.
  const end = Math.min(boxSize, bytes.length);
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(bytes, i, i + 4));
  return brands;
}

/**
 * HEIC: any HEVC brand, or a generic HEIF brand without an AVIF brand. An
 * AVIF lists mif1/msf1 too, and heic-decode cannot read it.
 */
function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== 'ftyp') return false;
  const brands = ftypBrands(bytes);
  if (brands.some((b) => HEVC_BRANDS.has(b))) return true;
  if (brands.some((b) => AVIF_BRANDS.has(b))) return false;
  return brands.some((b) => GENERIC_HEIF_BRANDS.has(b));
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
