// What the owner typed or pasted into Search Discogs (D-15, RESEARCH
// Pattern 7). Client-safe and pure: the dialog and the search route call
// this same function, so both always classify a value the same way, and
// the server's answer is the authoritative one (T-03-33).
//
// Release: 1-10 digits, [r123] or r123, or a discogs.com / www.discogs.com
// link whose path has /release/{id} anywhere (/fr/, /sell/ and the legacy
// /Artist-Title/release/{id} form included), with or without https://.
// Master: [m123] or m123, or such a link with /master/{id}. A bare number is
// always read as a release (A-03-24): release and master numbers collide
// (Pitfall 5), so the dialog shows the fetched release unselected.
// Anything else, other hosts included, is plain search text.

export const MASTER_REFUSAL =
  "That's a master, not a release — pick a specific version";

export type DiscogsRef =
  | { kind: 'release'; id: number }
  | { kind: 'master'; id: number }
  | { kind: 'text'; q: string };

const HOSTS = new Set(['discogs.com', 'www.discogs.com']);

/** 1-10 digits with a value of at least 1, else null. */
function toId(digits: string): number | null {
  if (!/^\d{1,10}$/.test(digits)) return null;
  const id = Number(digits);
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

function fromUrl(s: string): DiscogsRef | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s)
    ? s
    : /^(www\.)?discogs\.com(\/|$)/i.test(s)
      ? `https://${s}`
      : null;
  if (!withScheme) return null;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const release = /\/release\/(\d+)(?!\d)/.exec(url.pathname);
  if (release) {
    const id = toId(release[1]);
    return id === null ? null : { kind: 'release', id };
  }
  const master = /\/master\/(\d+)(?!\d)/.exec(url.pathname);
  if (master) {
    const id = toId(master[1]);
    return id === null ? null : { kind: 'master', id };
  }
  return null;
}

export function parseDiscogsRef(input: string): DiscogsRef {
  const s = input.trim();
  const bare = /^\d+$/.test(s) ? toId(s) : null;
  if (bare !== null) return { kind: 'release', id: bare };
  const markup = /^\[?([rm])(\d+)\]?$/i.exec(s);
  if (markup && markup[0].startsWith('[') === markup[0].endsWith(']')) {
    const id = toId(markup[2]);
    if (id !== null) {
      return markup[1].toLowerCase() === 'r'
        ? { kind: 'release', id }
        : { kind: 'master', id };
    }
  }
  return fromUrl(s) ?? { kind: 'text', q: s };
}
