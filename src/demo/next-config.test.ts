import type { NextConfig } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';

// DEMO-01 (D-02): the demo branch exists only under NEXT_PUBLIC_DEMO=1 and
// the real config keeps its behaviour.

async function loadConfig(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  const mod = await import('../../next.config');
  return mod.default as NextConfig;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config', () => {
  it('keeps the real config when NEXT_PUBLIC_DEMO is unset', async () => {
    const c = await loadConfig({
      NEXT_PUBLIC_DEMO: undefined,
      NEXT_DIST_DIR: undefined,
    });
    expect(c.output).toBeUndefined();
    expect(c.basePath).toBeUndefined();
    expect(c.pageExtensions).toBeUndefined();
    expect(c.trailingSlash).toBeUndefined();
    expect(c.env).toBeUndefined();
    expect(c.distDir).toBe('.next');
    expect(c.agentRules).toBe(false);
    expect(c.experimental?.proxyClientMaxBodySize).toBe('64mb');
    expect(c.turbopack?.rules?.['*.css']).toEqual({
      loaders: ['@tailwindcss/turbopack'],
      as: '*.css',
    });
  });

  it('keeps the NEXT_DIST_DIR rule in the real config', async () => {
    expect(
      (
        await loadConfig({
          NEXT_PUBLIC_DEMO: undefined,
          NEXT_DIST_DIR: '.next/verify',
        })
      ).distDir,
    ).toBe('.next/verify');
    expect(
      (
        await loadConfig({
          NEXT_PUBLIC_DEMO: undefined,
          NEXT_DIST_DIR: '../elsewhere',
        })
      ).distDir,
    ).toBe('.next');
  });

  it('is the real config for any value other than exactly 1', async () => {
    const c = await loadConfig({ NEXT_PUBLIC_DEMO: 'true' });
    expect(c.output).toBeUndefined();
    expect(c.basePath).toBeUndefined();
  });

  it('returns the static-export demo config under NEXT_PUBLIC_DEMO=1', async () => {
    const c = await loadConfig({
      NEXT_PUBLIC_DEMO: '1',
      NEXT_DIST_DIR: '.next/verify',
    });
    expect(c.output).toBe('export');
    expect(c.basePath).toBe('/discogs-ai-importer');
    expect(c.assetPrefix).toBeUndefined();
    expect(c.trailingSlash).toBe(true);
    expect(c.pageExtensions).toEqual(['demo.tsx', 'demo.ts']);
    expect(c.distDir).toBeUndefined();
    expect(c.env?.NEXT_PUBLIC_BASE_PATH).toBe('/discogs-ai-importer');
    expect(c.experimental?.proxyClientMaxBodySize).toBeUndefined();
    expect(c.turbopack?.rules?.['*.css']).toBeDefined();
  });
});
