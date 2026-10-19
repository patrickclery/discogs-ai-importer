import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Project instructions live in .claude/CLAUDE.md; stop `next dev` writing AGENTS.md.
  agentRules: false,
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
