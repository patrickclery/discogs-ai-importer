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
