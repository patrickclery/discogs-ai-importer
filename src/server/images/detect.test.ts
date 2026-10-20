import { describe, expect, it } from 'vitest';
import { detectImageKind, extensionFor, mimeFor } from './detect';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );

function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + 4 * compatible.length;
  return bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compatible);
}

describe('detectImageKind (D-06 magic bytes)', () => {
  it('detects JPEG, PNG and WebP signatures', () => {
    expect(detectImageKind(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(
      detectImageKind(
        bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe('png');
    expect(detectImageKind(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))).toBe(
      'webp',
    );
  });

  it('detects HEIC/HEIF by major or compatible brand', () => {
    expect(detectImageKind(ftyp('heic'))).toBe('heic');
    expect(detectImageKind(ftyp('mif1'))).toBe('heic');
    expect(detectImageKind(ftyp('isom', ['avif', 'heix']))).toBe('heic');
  });

  it('refuses AVIF, which lists the generic HEIF brands too (IN-02)', () => {
    expect(detectImageKind(ftyp('avif', ['avif', 'mif1', 'miaf']))).toBeNull();
    expect(detectImageKind(ftyp('avis', ['avis', 'msf1', 'miaf']))).toBeNull();
    expect(detectImageKind(ftyp('mif1', ['avif', 'mif1']))).toBeNull();
  });

  it('accepts every HEIC/HEIF brand as the major brand', () => {
    for (const brand of ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif']) {
      expect(detectImageKind(ftyp(brand)), brand).toBe('heic');
      expect(detectImageKind(ftyp('isom', [brand])), brand).toBe('heic');
    }
  });

  it('returns null for GIF, PDF and random bytes', () => {
    expect(detectImageKind(bytes('GIF89a', [1, 0, 1, 0]))).toBeNull();
    expect(detectImageKind(bytes('GIF87a', [1, 0, 1, 0]))).toBeNull();
    expect(detectImageKind(bytes('%PDF-1.4\n%'))).toBeNull();
    // A fixed pseudo-random sequence (LCG) that starts with no signature.
    let x = 12345;
    const random = Uint8Array.from({ length: 256 }, () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x & 0xff;
    });
    random[0] = 0x42;
    expect(detectImageKind(random)).toBeNull();
  });

  it('refuses everything else', () => {
    expect(detectImageKind(bytes('%PDF-1.7\n'))).toBeNull();
    expect(detectImageKind(bytes('hello world'))).toBeNull();
    expect(detectImageKind(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBeNull();
    expect(detectImageKind(ftyp('isom', ['mp42', 'avc1']))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
    expect(detectImageKind(bytes([0xff, 0xd8]))).toBeNull();
  });

  it('maps kinds to extensions and MIME types', () => {
    expect(extensionFor('jpeg')).toBe('jpg');
    expect(extensionFor('heic')).toBe('heic');
    expect(mimeFor('webp')).toBe('image/webp');
  });
});
