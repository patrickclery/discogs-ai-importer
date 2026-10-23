import type { NextConfig } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as real from '@/lib/asset-urls';
import * as demo from './asset-urls';

// D-08, T-05-14, T-05-15: the image-URL seam. The real module returns the
// exact strings the components built inline before; the demo alias target
// points covers and crops at static basePath demo-assets files.

// Type compatibility: the demo module must be a drop-in for the real one
// (next.config aliases '@/lib/asset-urls' to it), so tsc checks this.
const demoAsReal: typeof real = demo;

const BASE = '/discogs-ai-importer';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('real asset-urls (unchanged behaviour)', () => {
  it('builds the candidate cover route from the encoded candidate id', () => {
    expect(real.candidateThumbSrc({ id: 'c 1', releaseId: 5 })).toBe(
      '/api/discogs/thumb/c%201',
    );
    expect(real.candidateThumbSrc({ id: 'abc', releaseId: 7 })).toBe(
      '/api/discogs/thumb/abc',
    );
  });

  it('builds the dialog cover route from the encoded search id', () => {
    expect(real.searchThumbSrc('s/1', 9)).toBe(
      '/api/discogs/searches/s%2F1/thumb/9',
    );
  });

  it('accepts only /api/files/ crop URLs (T-04-33)', () => {
    expect(real.isAppFileUrl('/api/files/x')).toBe(true);
    expect(real.isAppFileUrl(`${BASE}/demo-assets/x`)).toBe(false);
    expect(real.isAppFileUrl('https://x')).toBe(false);
    expect(real.isAppFileUrl('/api/filesx')).toBe(false);
    expect(real.isAppFileUrl(null)).toBe(false);
    expect(real.isAppFileUrl(undefined)).toBe(false);
    expect(real.isAppFileUrl(42)).toBe(false);
  });
});

describe('demo asset-urls', () => {
  it('is assignable to the real module type', () => {
    expect(demoAsReal).toBe(demo);
  });

  it('points covers at basePath demo-assets by release id', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', BASE);
    expect(demo.candidateThumbSrc({ id: 'c 1', releaseId: 5 })).toBe(
      `${BASE}/demo-assets/covers/5.svg`,
    );
    expect(demo.searchThumbSrc('s/1', 9)).toBe(
      `${BASE}/demo-assets/covers/9.svg`,
    );
  });

  it('accepts only basePath demo-assets crop URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', BASE);
    expect(demo.isAppFileUrl(`${BASE}/demo-assets/crops/01.webp`)).toBe(true);
    expect(demo.isAppFileUrl('/api/files/x')).toBe(false);
    expect(demo.isAppFileUrl('/demo-assets/crops/01.webp')).toBe(false);
    expect(demo.isAppFileUrl('https://x')).toBe(false);
    expect(demo.isAppFileUrl(null)).toBe(false);
  });
});

async function loadConfig(demoFlag: string | undefined): Promise<NextConfig> {
  vi.stubEnv('NEXT_PUBLIC_DEMO', demoFlag);
  vi.resetModules();
  return (await import('../../next.config')).default as NextConfig;
}

describe('next.config alias', () => {
  it('aliases @/lib/asset-urls to the demo module only in the demo build', async () => {
    const demoConfig = await loadConfig('1');
    expect(demoConfig.turbopack?.resolveAlias).toMatchObject({
      '@/lib/asset-urls': './src/demo/asset-urls.ts',
    });
    const realConfig = await loadConfig(undefined);
    expect(realConfig.turbopack?.resolveAlias).toBeUndefined();
  });
});
