import type { NextConfig } from 'next';

// NEXT_DIST_DIR lets the verify scripts build and start into .next/<name>
// while a long-running `next start` keeps serving the default .next build.
// Only .next itself or a direct child of it is accepted.
const distDir = /^\.next(\/[A-Za-z0-9_-]+)?$/.test(
  process.env.NEXT_DIST_DIR ?? '',
)
  ? (process.env.NEXT_DIST_DIR as string)
  : '.next';

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
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
