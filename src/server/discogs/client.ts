import 'server-only';
import { getSecret } from '../secrets';
import { getDiscogsAuth, markAuthInvalid } from './auth';
import { apiBase, DISCOGS_ACCEPT, DISCOGS_USER_AGENT } from './config';
import { type DiscogsGate, discogsGate, parseRetryAfter } from './gate';
import { buildOAuthHeader } from './oauth';

// The one way this app talks to api.discogs.com (D-04, D-05, D-06). Every
// request carries the project User-Agent, waits on the process-wide gate and
// is classified into one of the error classes below. It reads only, except
// for two POSTs: the token exchange that finishes connecting (T-03-09) and
// the single add-to-collection POST (D-06), which needs the stored sign-in,
// a folder of 1 or more and the stored username in the path. Every other
// method or path is refused before any request. Error messages carry the
// status, method and path only, with the username segment written as :u:
// never headers, the query, the body, the username or a secret (T-03-04,
// T-04-04). Nothing here logs the request.

const REQUEST_TIMEOUT_MS = 20_000;
/** Pause when a 429 carries no usable Retry-After (D-06). */
const DEFAULT_RATE_LIMIT_PAUSE_MS = 60_000;
/** The POST that finishes connecting (T-03-09). */
const ACCESS_TOKEN_PATH = '/oauth/access_token';
/**
 * The add-to-collection POST (D-06),
 * POST /users/{username}/collection/folders/{folderId}/releases/{releaseId}:
 * a folder of 1 or more (folder 0, "All", is read-only) and a positive
 * release id.
 */
const ADD_TO_FOLDER =
  /^\/users\/([^/]+)\/collection\/folders\/[1-9]\d{0,9}\/releases\/[1-9]\d{0,11}$/;

export type DiscogsAuthMode = 'none' | 'consumer' | 'request' | 'oauth';

export type DiscogsRequest = {
  method?: string;
  /** Absolute API path, e.g. '/database/search'; no query string. */
  path: string;
  query?: Record<string, string | number | undefined | null>;
  form?: Record<string, string>;
  /**
   * none: unsigned. consumer: consumer key only (request token).
   * request: the token and tokenSecret passed here. oauth: the stored token.
   */
  auth: DiscogsAuthMode;
  token?: string;
  tokenSecret?: string;
  callback?: string;
  verifier?: string;
  /**
   * The caller's abort signal. Only job handlers pass one, and a request
   * with a signal never waits out a rate-limit pause: it throws
   * DiscogsRateLimitedError at once so the job defers (WR-02, D-06).
   */
  signal?: AbortSignal;
};

export type DiscogsResponse = {
  status: number;
  headers: Headers;
  text: string;
  /** The parsed body, or null when it is not JSON. */
  json: unknown;
};

export type DiscogsFetchDeps = {
  fetchImpl?: typeof fetch;
  gate?: DiscogsGate;
};

export class DiscogsRateLimitedError extends Error {
  readonly status = 429;
  /** Epoch ms the gate resumes. */
  readonly resumeAt: number;
  constructor(message: string, resumeAt: number) {
    super(message);
    this.name = 'DiscogsRateLimitedError';
    this.resumeAt = resumeAt;
  }
}

export class DiscogsAuthError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = 401) {
    super(message);
    this.name = 'DiscogsAuthError';
    this.status = status;
  }
}

export class DiscogsNotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'DiscogsNotFoundError';
  }
}

export class DiscogsRequestError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'DiscogsRequestError';
    this.status = status;
  }
}

export class DiscogsUnavailableError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'DiscogsUnavailableError';
    this.status = status;
  }
}

/**
 * GET anything; POST only the token exchange and the add to a folder of the
 * stored user, signed with the stored sign-in. Everything else is refused.
 */
function isAllowed(req: DiscogsRequest, method: string): boolean {
  if (method === 'GET') return true;
  if (method !== 'POST') return false;
  if (req.path === ACCESS_TOKEN_PATH) return true;
  const add = ADD_TO_FOLDER.exec(req.path);
  if (!add || req.auth !== 'oauth') return false;
  const username = getDiscogsAuth()?.username;
  return !!username && add[1] === encodeURIComponent(username);
}

/** The path with the segment after /users/ written as :u (T-04-04). */
export function redactUserPath(path: string): string {
  return path.replace(/^\/users\/[^/]*/, '/users/:u');
}

/** A short, secret-free cause such as ECONNREFUSED, when there is one. */
function causeCode(err: unknown): string | null {
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
  const code = typeof cause?.code === 'string' ? cause.code : null;
  return code && /^[A-Z][A-Z0-9_]{1,40}$/.test(code) ? code : null;
}

function authHeader(req: DiscogsRequest): string | null {
  if (req.auth === 'none') return null;
  const consumerKey = getSecret('discogsConsumerKey');
  const consumerSecret = getSecret('discogsConsumerSecret');
  if (!consumerKey || !consumerSecret) {
    throw new DiscogsAuthError(
      'Discogs consumer credentials are not set',
      null,
    );
  }
  let token: string | undefined;
  let tokenSecret: string | undefined;
  if (req.auth === 'request') {
    if (!req.token) {
      throw new DiscogsRequestError('Discogs request has no token');
    }
    token = req.token;
    tokenSecret = req.tokenSecret ?? '';
  } else if (req.auth === 'oauth') {
    const stored = getDiscogsAuth();
    if (!stored) {
      throw new DiscogsAuthError('Discogs is not connected', null);
    }
    token = stored.token;
    tokenSecret = stored.tokenSecret;
  }
  return buildOAuthHeader({
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    callback: req.callback,
    verifier: req.verifier,
  });
}

function buildUrl(req: DiscogsRequest): URL {
  if (!req.path.startsWith('/') || /[?#]/.test(req.path)) {
    throw new DiscogsRequestError('Discogs request path is not a plain path');
  }
  const url = new URL(`${apiBase()}${req.path}`);
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  return url;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function discogsFetch(
  req: DiscogsRequest,
  deps: DiscogsFetchDeps = {},
): Promise<DiscogsResponse> {
  const method = (req.method ?? 'GET').toUpperCase();
  const label = `Discogs ${method} ${redactUserPath(req.path)}`;
  // The only write to the owner's account is the add POST (D-06).
  if (!isAllowed(req, method)) {
    throw new DiscogsRequestError(`${label} refused: not an allowed request`);
  }
  const url = buildUrl(req);
  const authorization = authHeader(req);
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const gate = deps.gate ?? discogsGate();

  const headers: Record<string, string> = {
    'User-Agent': DISCOGS_USER_AGENT,
    Accept: DISCOGS_ACCEPT,
  };
  if (authorization) headers.Authorization = authorization;
  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(req.form ?? {}).toString();
  }

  // WR-02 (D-06): a job must not sleep through a pause a route's 429 set;
  // its timeout would abort the wait and spend an attempt. Defer instead.
  const pausedUntil = gate.pausedUntil();
  if (req.signal && pausedUntil !== null) {
    throw new DiscogsRateLimitedError(`${label} deferred: paused`, pausedUntil);
  }
  await gate.acquire(req.signal);

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  let res: Response;
  let text: string;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body,
      redirect: 'error',
      signal,
    });
    gate.observe(res.headers);
    text = await res.text();
  } catch (err) {
    // The caller's own abort (worker stop, lease loss) keeps its reason.
    if (req.signal?.aborted) throw req.signal.reason ?? err;
    const code = causeCode(err);
    const why = timeout.aborted ? 'timed out' : 'unreachable';
    throw new DiscogsUnavailableError(
      `${label} ${why}${code ? ` (${code})` : ''}`,
    );
  }

  const status = res.status;
  if (status >= 200 && status < 300) {
    return { status, headers: res.headers, text, json: parseJson(text) };
  }
  const answered = `${label} answered ${status}`;
  if (status === 429) {
    const ms =
      parseRetryAfter(res.headers.get('retry-after')) ??
      DEFAULT_RATE_LIMIT_PAUSE_MS;
    gate.pause(ms);
    const resumeAt = gate.pausedUntil() ?? Date.now() + ms;
    throw new DiscogsRateLimitedError(answered, resumeAt);
  }
  if (status === 401) {
    if (req.auth === 'oauth') markAuthInvalid();
    throw new DiscogsAuthError(answered, 401);
  }
  if (status === 404) throw new DiscogsNotFoundError(answered);
  if (status >= 400 && status < 500) {
    throw new DiscogsRequestError(answered, status);
  }
  throw new DiscogsUnavailableError(answered, status);
}
