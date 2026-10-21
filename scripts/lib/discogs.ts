// Fake Discogs helpers shared by verify-discogs (and later Phase 3 scripts).
// Node built-ins only; imports nothing from src/. Every run talks to
// test/fixtures/fake-discogs.mjs and a temp secrets file, never to
// api.discogs.com or the owner's real secrets.json.
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';

const FAKE_DISCOGS = path.join(process.cwd(), 'test/fixtures/fake-discogs.mjs');

/** Canary consumer credentials; any response containing them is a leak. */
export const CANARY_CONSUMER_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
export const CANARY_CONSUMER_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';

/** Prefixes of every secret value the fake issues (see its header). */
export const FAKE_SECRET_PREFIXES = [
  'fake-rts-',
  'fake-verifier-',
  'fake-at-',
  'fake-ats-',
];

export const PROJECT_USER_AGENT =
  'DiscogsAIImporter/0.1 +https://github.com/patrickclery/discogs-ai-importer';

export type FakeDiscogs = {
  port: number;
  baseUrl: string;
  logFile: string;
  /** POST /__control; answers the fake's state. */
  control(patch: Record<string, unknown>): Promise<FakeState>;
  state(): Promise<FakeState>;
  stop(): Promise<void>;
};

export type FakeState = {
  authorize: string;
  accessSignature: string;
  revoked: boolean;
  lastCallback: string | null;
  pendingRequestTokens: number;
};

export type FakeLogEntry = {
  t: number;
  surface: 'api' | 'web';
  method: string;
  path: string;
  query: Record<string, string>;
  userAgent: string | null;
  accept: string | null;
  oauthParams: string[];
  signatureMethod: string | null;
};

export async function startFakeDiscogs(opts: {
  tmp: string;
  env?: Record<string, string>;
}): Promise<FakeDiscogs> {
  const logFile = path.join(opts.tmp, 'fake-discogs.jsonl');
  const child: ChildProcess = spawn(process.execPath, [FAKE_DISCOGS, '0'], {
    env: {
      ...process.env,
      FAKE_DISCOGS_CONSUMER_KEY: CANARY_CONSUMER_KEY,
      FAKE_DISCOGS_CONSUMER_SECRET: CANARY_CONSUMER_SECRET,
      FAKE_DISCOGS_LOG: logFile,
      ...opts.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`fake-discogs did not start\n${out}`));
    }, 10_000);
    const onData = (d: Buffer) => {
      out += d;
      const m = /fake-discogs listening (\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (d) => {
      out += d;
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`fake-discogs exited ${code}\n${out}`));
    });
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  async function controlRequest(init: RequestInit = {}): Promise<FakeState> {
    const res = await fetch(`${baseUrl}/__control`, init);
    if (!res.ok) throw new Error(`fake-discogs /__control ${res.status}`);
    return (await res.json()) as FakeState;
  }

  return {
    port,
    baseUrl,
    logFile,
    control: (patch) =>
      controlRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    state: () => controlRequest(),
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise<void>((r) => child.once('exit', () => r()));
      child.kill('SIGTERM');
      await Promise.race([
        exited,
        new Promise<void>((r) => setTimeout(r, 5000).unref()),
      ]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    },
  };
}

/** The temp secrets file discogsEnv points the app at. */
export function tempSecretsFile(tmp: string): string {
  return path.join(tmp, 'secrets', 'secrets.json');
}

/**
 * Server env for the app under test: Discogs bases on the fake, canary
 * consumer credentials and a temp SECRETS_FILE outside DATA_DIR, so a verify
 * run never reads or writes the owner's real secrets.json.
 */
export function discogsEnv(
  fake: Pick<FakeDiscogs, 'baseUrl'>,
  tmp: string,
): Record<string, string> {
  return {
    DISCOGS_API_BASE: fake.baseUrl,
    DISCOGS_WEB_BASE: fake.baseUrl,
    DISCOGS_IMAGE_BASE: `${fake.baseUrl}/img`,
    DISCOGS_CONSUMER_KEY: CANARY_CONSUMER_KEY,
    DISCOGS_CONSUMER_SECRET: CANARY_CONSUMER_SECRET,
    SECRETS_FILE: tempSecretsFile(tmp),
  };
}

export type ConnectCtx = { baseUrl: string; origin: string };

export type ConnectTrace = {
  /** Status and body of POST /api/discogs/connect. */
  connect: { status: number; body: string };
  authorizeUrl: string;
  /** Where the fake authorize page sent the browser. */
  callbackUrl: string;
  /** The callback's final 303 Location. */
  location: string;
};

/** Runs the browser half of a connect and keeps every hop for the checks. */
export async function connectTrace(ctx: ConnectCtx): Promise<ConnectTrace> {
  const res = await fetch(`${ctx.baseUrl}/api/discogs/connect`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    body: '{}',
  });
  const body = await res.text();
  if (res.status !== 200) {
    throw new Error(
      `POST /api/discogs/connect returned ${res.status}: ${body}`,
    );
  }
  const { authorizeUrl } = JSON.parse(body) as { authorizeUrl: string };
  const auth = await fetch(authorizeUrl, { redirect: 'manual' });
  await auth.text();
  const callbackUrl = auth.headers.get('location');
  if (auth.status !== 302 || !callbackUrl) {
    throw new Error(`the fake authorize page answered ${auth.status}`);
  }
  const cb = await fetch(callbackUrl, { redirect: 'manual' });
  await cb.text();
  const location = cb.headers.get('location');
  if (cb.status !== 303 || !location) {
    throw new Error(`the callback answered ${cb.status}, not a 303`);
  }
  return {
    connect: { status: res.status, body },
    authorizeUrl,
    callbackUrl,
    location,
  };
}

/** POST connect, follow the fake authorize page, return the final Location. */
export async function connectViaApi(ctx: ConnectCtx): Promise<string> {
  return (await connectTrace(ctx)).location;
}
