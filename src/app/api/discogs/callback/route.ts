import { connection } from 'next/server';
import { takePendingConnect } from '@/server/discogs/auth';
import { completeConnect } from '@/server/discogs/connect';

// Where discogs.com sends the owner's browser after the authorize page
// (D-01, D-03). A top-level GET, which the proxy allows. T-03-01: only an
// oauth_token from our own pending entry is accepted, once, within 15
// minutes. T-03-05: the answer is always a 303 to the fixed
// /settings?discogs= prefix with one of four values, never anywhere else,
// and no token or verifier is ever echoed into it or a log.

type Outcome = 'connected' | 'denied' | 'expired' | 'error';

/** host[:port]; the proxy has already limited it to 127.0.0.1/localhost. */
const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

function settingsRedirect(host: string | null, outcome: Outcome): Response {
  const safeHost = host && HOST_RE.test(host) ? host : '127.0.0.1';
  return new Response(null, {
    status: 303,
    headers: {
      location: `http://${safeHost}/settings?discogs=${outcome}`,
      'cache-control': 'no-store',
    },
  });
}

export async function GET(req: Request) {
  await connection();
  const host = req.headers.get('host');
  const params = new URL(req.url).searchParams;
  const denied = params.get('denied');
  const verifier = params.get('oauth_verifier');
  // A denial may name the request token only in denied= (RESEARCH A6).
  const oauthToken = params.get('oauth_token') || denied || '';

  const pending = oauthToken ? takePendingConnect(oauthToken) : null;
  if (!pending) return settingsRedirect(host, 'expired');
  if (denied !== null || !verifier) return settingsRedirect(host, 'denied');

  try {
    await completeConnect({ oauthToken, verifier, pending, via: 'callback' });
    return settingsRedirect(host, 'connected');
  } catch {
    return settingsRedirect(host, 'error');
  }
}
