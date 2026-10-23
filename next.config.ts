import type { NextConfig } from 'next';

// NEXT_DIST_DIR lets the verify scripts build and start into .next/<name>
// while a long-running `next start` keeps serving the default .next build.
// Only .next itself or a direct child of it is accepted.
const distDir = /^\.next(\/[A-Za-z0-9_-]+)?$/.test(
  process.env.NEXT_DIST_DIR ?? '',
)
  ? (process.env.NEXT_DIST_DIR as string)
  : '.next';

const cssRules = {
  '*.css': {
    loaders: ['@tailwindcss/turbopack'],
    as: '*.css',
  },
};

const nextConfig: NextConfig = {
  distDir,
  // Project instructions live in .claude/CLAUDE.md; stop `next dev` writing AGENTS.md.
  agentRules: false,
  experimental: {
    // src/proxy.ts makes Next buffer every request body, by default only the
    // first 10 MB, silently (RESEARCH Pitfall 1). Matches MAX_UPLOAD_BYTES.
    proxyClientMaxBodySize: '64mb',
  },
  turbopack: {
    rules: cssRules,
  },
};

// Phase 5 demo (D-02): NEXT_PUBLIC_DEMO=1 builds a static export of the same
// app for GitHub Pages. Only *.demo.tsx/*.demo.ts files are routes, so every
// route handler, server action, proxy and real page drops out of the build;
// every /api call is answered in the browser by src/demo/fetch-shim.ts.
// No distDir: with output 'export' a custom distDir only renames out/, the
// build itself always goes to .next (scripts/demo/build-demo.ts builds in a
// scratch copy for that reason, D-20). assetPrefix follows basePath.
const DEMO_BASE_PATH = '/discogs-ai-importer';

const demoConfig: NextConfig = {
  output: 'export',
  basePath: DEMO_BASE_PATH,
  trailingSlash: true,
  pageExtensions: ['demo.tsx', 'demo.ts'],
  agentRules: false,
  env: { NEXT_PUBLIC_BASE_PATH: DEMO_BASE_PATH },
  turbopack: {
    rules: cssRules,
    // Image URLs (D-08): covers and crops become static basePath assets.
    resolveAlias: { '@/lib/asset-urls': './src/demo/asset-urls.ts' },
  },
};

export default process.env.NEXT_PUBLIC_DEMO === '1' ? demoConfig : nextConfig;
