import 'server-only';

// Discogs endpoints and the project User-Agent (D-04). The *_BASE variables
// are test hooks that point the app at test/fixtures/fake-discogs.mjs; an
// override is honored only for https, or http on 127.0.0.1 / localhost
// (T-03-08). Anything else is ignored and the real host is used.

export const DISCOGS_USER_AGENT =
  'DiscogsAIImporter/0.1 +https://github.com/patrickclery/discogs-ai-importer';

export const DISCOGS_ACCEPT = 'application/vnd.discogs.v2.discogs+json';

const LOOPBACK = new Set(['127.0.0.1', 'localhost']);

/** The override as an origin-plus-path without a trailing slash, or null. */
function override(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const ok =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  if (!ok || url.username || url.password) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

export function apiBase(): string {
  return override('DISCOGS_API_BASE') ?? 'https://api.discogs.com';
}

export function webBase(): string {
  return override('DISCOGS_WEB_BASE') ?? 'https://www.discogs.com';
}

export function imageBase(): string {
  return override('DISCOGS_IMAGE_BASE') ?? 'https://i.discogs.com';
}
