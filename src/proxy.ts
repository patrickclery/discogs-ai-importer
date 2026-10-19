// Loopback guard (FOUND-01, T-01-02). Binding to 127.0.0.1 stops LAN clients,
// but not a malicious page in the owner's own browser: DNS rebinding sends a
// foreign Host header, and a cross-site form POST sends a foreign Origin.
// The Host check compares hostnames only, so a PORT override keeps working.
// Mutations must come from this exact origin (scheme, host and port): another
// local server on localhost:5173 is a different origin and is refused (WR-01).
// Self-contained on purpose: proxy runs separately from the render code.
import { type NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

/** Hostname of a Host header value ("host[:port]"), or '' when unparsable. */
function hostnameOfHost(value: string | null): string {
  if (!value) return '';
  try {
    return new URL(`http://${value}`).hostname;
  } catch {
    return '';
  }
}

/** Serialized origin of a URL, or '' when malformed or opaque ("null"). */
function originOf(value: string): string {
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? '' : origin;
  } catch {
    return '';
  }
}

/** Fetch metadata values a same-origin or user-initiated request carries. */
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none']);

const forbidden = () => new NextResponse('Forbidden', { status: 403 });

export function proxy(request: NextRequest) {
  const host = request.headers.get('host');
  if (!ALLOWED_HOSTNAMES.has(hostnameOfHost(host))) {
    return forbidden();
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin !== null) {
      const own = originOf(`http://${host}`);
      if (!own || originOf(origin) !== own) return forbidden();
    }
    const site = request.headers.get('sec-fetch-site');
    if (site !== null && !ALLOWED_FETCH_SITES.has(site)) return forbidden();
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
