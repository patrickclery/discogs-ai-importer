// Demo Settings actions (D-12, D-03, D-04). The demo config aliases
// '@/app/settings/actions' to this plain module, so the static export holds
// no server action. Each export answers what src/app/settings/actions.ts
// answers and only changes page memory (state.account), then emit().
// A typed credential is reduced to the real mask() tail at once: the full
// value is never stored, returned or logged (T-05-23).
import { type TestResult, VISION_MODELS } from '@/lib/claude-types';
import type { SecretKey } from '@/server/secrets';
import { emit, getState } from './store';

// The real ActionState shape (settings-actions.test.ts checks they match).
// Not imported from '@/app/settings/actions': in the demo build that alias
// points back at this file.
export type ActionState =
  | { ok: true; savedKeys: SecretKey[] }
  | {
      ok: false;
      fieldErrors?: Partial<Record<SecretKey, string>>;
      formError?: string;
    }
  | null;

/** Same order as SECRET_KEYS in src/server/secrets.ts (types only here). */
const SECRET_KEYS = [
  'discogsConsumerKey',
  'discogsConsumerSecret',
] as const satisfies readonly SecretKey[];

const TAIL_FIELD = {
  discogsConsumerKey: 'consumerKeyTail',
  discogsConsumerSecret: 'consumerSecretTail',
} as const satisfies Record<SecretKey, string>;

const VALUE_ERROR =
  "Paste the full value. It can't be empty or contain spaces.";
const NOTHING_TO_SAVE = 'Nothing to save. Paste a value first.';
const FOLDER_ERROR = 'that folder is not in your Discogs folder list';

/** A save or clear round trip. */
const SETTINGS_DELAY_MS = 250;
/** Test Claude feels like a real (short) headless call. */
const TEST_CLAUDE_DELAY_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The real mask(): '••••' for 8 chars or fewer, else '…' plus the last 4. */
function mask(value: string): string {
  if (value.length <= 8) return '••••';
  return `…${value.slice(-4)}`;
}

function isSecretKey(key: unknown): key is SecretKey {
  return (SECRET_KEYS as readonly unknown[]).includes(key);
}

/** clearDiscogsAuth + clearPendingConnect: the sign-in is bound to the key. */
function disconnect(): void {
  const account = getState().account;
  account.connected = false;
  account.needsReconnect = false;
  account.pendingConnectAt = null;
}

export async function saveDiscogsCredentials(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tails: Partial<Record<SecretKey, string>> = {};
  const fieldErrors: Partial<Record<SecretKey, string>> = {};
  for (const key of SECRET_KEYS) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value.length > 0 && /^\S+$/.test(value)) tails[key] = mask(value);
    else fieldErrors[key] = VALUE_ERROR;
  }
  await delay(SETTINGS_DELAY_MS);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  const savedKeys = SECRET_KEYS.filter((k) => tails[k] !== undefined);
  if (savedKeys.length === 0) return { ok: false, formError: NOTHING_TO_SAVE };

  const account = getState().account;
  // Only the tail is comparable here: a changed tail is a changed value,
  // which disconnects as in the real action (WR-03).
  let changed = false;
  for (const key of savedKeys) {
    const field = TAIL_FIELD[key];
    if (account[field] !== tails[key]) changed = true;
    account[field] = tails[key] ?? null;
  }
  if (changed) disconnect();
  emit();
  return { ok: true, savedKeys };
}

export async function clearSecretAction(
  key: SecretKey,
): Promise<{ ok: true } | { ok: false; formError: string }> {
  await delay(SETTINGS_DELAY_MS);
  if (!isSecretKey(key)) return { ok: false, formError: 'Unknown setting.' };
  getState().account[TAIL_FIELD[key]] = null;
  // Both keys are Discogs consumer values: clearing one disconnects.
  disconnect();
  emit();
  return { ok: true };
}

export async function saveVisionModel(
  id: string,
): Promise<{ ok: true } | { ok: false; formError: string }> {
  await delay(SETTINGS_DELAY_MS);
  if (!VISION_MODELS.some((m) => m.id === id)) {
    return { ok: false, formError: 'Choose one of the listed models.' };
  }
  getState().account.model = id;
  emit();
  return { ok: true };
}

export async function saveCollectionFolder(
  id: number,
): Promise<{ ok: true; name: string } | { ok: false; formError: string }> {
  await delay(SETTINGS_DELAY_MS);
  const account = getState().account;
  const folder =
    Number.isInteger(id) && id >= 1
      ? account.folders.find((f) => f.id === id)
      : undefined;
  if (!folder) return { ok: false, formError: FOLDER_ERROR };
  account.folderId = folder.id;
  emit();
  return { ok: true, name: folder.name };
}

/** The real success answer for the stored model (D-12: CLI always ready). */
export async function testClaudeAction(): Promise<TestResult> {
  await delay(TEST_CLAUDE_DELAY_MS);
  const model = getState().account.model;
  return {
    ok: true,
    model,
    message: `Claude works. ${model} answered through your subscription.`,
  };
}
