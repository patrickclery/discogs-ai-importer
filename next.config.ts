import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
