// Loopback guard (FOUND-01, T-01-02). Binding to 127.0.0.1 stops LAN clients,
// but not a malicious page in the owner's own browser: DNS rebinding sends a
// foreign Host header, and a cross-site form POST sends a foreign Origin.
// Hostnames are compared without ports so a PORT override keeps working.
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

/** Hostname of an Origin header value (a URL), or '' when malformed or "null". */
function hostnameOfOrigin(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

const forbidden = () => new NextResponse('Forbidden', { status: 403 });

export function proxy(request: NextRequest) {
  if (!ALLOWED_HOSTNAMES.has(hostnameOfHost(request.headers.get('host')))) {
    return forbidden();
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin !== null && !ALLOWED_HOSTNAMES.has(hostnameOfOrigin(origin))) {
      return forbidden();
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
