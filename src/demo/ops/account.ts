// The demo's Discogs account (D-12, D-04): Connect, paste code, Test,
// Disconnect and the folder list, all on state.account in page memory.
// Synchronous on the state passed in; the route emits after a change.
import type { FoldersGetResult } from '@/app/api/discogs/folders/route';
import type { TestDiscogsResult } from '@/app/api/discogs/test/route';
import type { DemoState } from '../store';

const DEMO_USERNAME = 'demo-user';

/**
 * Where Connect sends the tab: the demo's own Settings page under the
 * basePath, a constant never built from request data (T-05-24). The full
 * reload resets the demo to "Connected as demo-user" (RESEARCH, D-04).
 */
export function demoAuthorizeUrl(): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/settings/?discogs=connected`;
}

export function connect(
  state: DemoState,
  now: number,
): { status: 'credentials_missing' } | { status: 'ok'; authorizeUrl: string } {
  const { account } = state;
  if (!account.consumerKeyTail || !account.consumerSecretTail) {
    return { status: 'credentials_missing' };
  }
  account.pendingConnectAt = now;
  return { status: 'ok', authorizeUrl: demoAuthorizeUrl() };
}

/** A pasted code (any non-empty text) signs in as demo-user. */
export function finish(
  state: DemoState,
  code: string,
): { status: 'empty' } | { status: 'ok'; username: string } {
  if (!code.trim()) return { status: 'empty' };
  const { account } = state;
  account.connected = true;
  account.username = DEMO_USERNAME;
  account.needsReconnect = false;
  account.pendingConnectAt = null;
  return { status: 'ok', username: account.username };
}

/** The identity check: a passing test drops any Reconnect needed state. */
export function test(
  state: DemoState,
): { status: 'not_connected' } | { status: 'ok'; result: TestDiscogsResult } {
  const { account } = state;
  if (!account.connected) return { status: 'not_connected' };
  account.needsReconnect = false;
  return { status: 'ok', result: { ok: true, username: account.username } };
}

/** Forget the sign-in and any connect still waiting (the real route). */
export function disconnect(state: DemoState): void {
  const { account } = state;
  account.connected = false;
  account.needsReconnect = false;
  account.pendingConnectAt = null;
}

/** GET /api/discogs/folders: the cached list, the current folder. */
export function readFolders(state: DemoState): FoldersGetResult {
  const { account } = state;
  return {
    folders: account.folders.map((f) => ({ ...f })),
    selectedId: account.folderId,
    savedId: account.folderId,
    savedMissing: !account.folders.some((f) => f.id === account.folderId),
    fetchedAt: account.foldersFetchedAt ?? state.initAt,
    connected: account.connected,
  };
}

/** POST { refresh: true }: "reads" the list again from Discogs. */
export function refreshFolders(
  state: DemoState,
  now: number,
):
  | { status: 'not_connected' }
  | { status: 'ok'; result: Omit<FoldersGetResult, 'connected'> } {
  if (!state.account.connected) return { status: 'not_connected' };
  state.account.foldersFetchedAt = now;
  const { connected: _connected, ...folderState } = readFolders(state);
  return { status: 'ok', result: folderState };
}
