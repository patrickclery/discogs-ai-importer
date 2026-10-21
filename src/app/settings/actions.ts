'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  clearClaudeCliStatusCache,
  type TestResult,
  testClaude,
} from '@/server/claude/cli';
import { clearDiscogsAuth, clearPendingConnect } from '@/server/discogs/auth';
import {
  clearSecret,
  getSecret,
  SECRET_KEYS,
  type SecretKey,
  saveSecrets,
} from '@/server/secrets';
import {
  getVisionModel,
  setVisionModel,
  VisionModelSchema,
} from '@/server/settings';

// Server Actions for /settings (D-09). Return values carry only status and
// copy; they never echo a submitted or stored value.

export type ActionState =
  | { ok: true; savedKeys: SecretKey[] }
  | {
      ok: false;
      fieldErrors?: Partial<Record<SecretKey, string>>;
      formError?: string;
    }
  | null;

const VALUE_ERROR =
  "Paste the full value. It can't be empty or contain spaces.";
const NOTHING_TO_SAVE = 'Nothing to save. Paste a value first.';

const ValueSchema = z
  .string()
  .trim()
  .min(1, VALUE_ERROR)
  .regex(/^\S+$/, VALUE_ERROR);

const KeySchema = z.enum(SECRET_KEYS);

function ioError(err: unknown): string {
  const reason = (err instanceof Error ? err.message : String(err)).slice(
    0,
    160,
  );
  return `Couldn't write secrets.json: ${reason}. Check that the file and its folder are writable, then try again.`;
}

export async function saveDiscogsCredentials(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values: Partial<Record<SecretKey, string>> = {};
  const fieldErrors: Partial<Record<SecretKey, string>> = {};
  for (const key of SECRET_KEYS) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const parsed = ValueSchema.safeParse(typeof raw === 'string' ? raw : '');
    if (parsed.success) values[key] = parsed.data;
    else fieldErrors[key] = VALUE_ERROR;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  const savedKeys = SECRET_KEYS.filter((k) => values[k] !== undefined);
  if (savedKeys.length === 0) return { ok: false, formError: NOTHING_TO_SAVE };

  try {
    const before = savedKeys.map((k) => getSecret(k));
    saveSecrets(values);
    // WR-03: the sign-in is bound to the consumer key (RESEARCH Pitfall 7,
    // A4). A value that changes the effective key or secret disconnects,
    // as clearing one does. An env value still wins, so it changes nothing.
    if (savedKeys.some((k, i) => getSecret(k) !== before[i])) {
      clearDiscogsAuth();
      clearPendingConnect();
    }
  } catch (err) {
    return { ok: false, formError: ioError(err) };
  }
  revalidatePath('/settings');
  return { ok: true, savedKeys };
}

export async function clearSecretAction(
  key: SecretKey,
): Promise<{ ok: true } | { ok: false; formError: string }> {
  const parsed = KeySchema.safeParse(key);
  if (!parsed.success) return { ok: false, formError: 'Unknown setting.' };
  try {
    clearSecret(parsed.data);
    // Both keys are Discogs consumer values, and the sign-in is bound to
    // the consumer key (RESEARCH Pitfall 7, A4): clearing one disconnects.
    clearDiscogsAuth();
    clearPendingConnect();
  } catch (err) {
    return { ok: false, formError: ioError(err) };
  }
  revalidatePath('/settings');
  return { ok: true };
}

export async function saveVisionModel(
  id: string,
): Promise<{ ok: true } | { ok: false; formError: string }> {
  const parsed = VisionModelSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, formError: 'Choose one of the listed models.' };
  }
  try {
    setVisionModel(parsed.data);
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).slice(
      0,
      160,
    );
    return {
      ok: false,
      formError: `Couldn't save the vision model: ${reason}. Try again.`,
    };
  }
  revalidatePath('/settings');
  return { ok: true };
}

/** One headless Claude call with the stored vision model (D-10, D-18). */
export async function testClaudeAction(): Promise<TestResult> {
  const result = await testClaude({ model: getVisionModel() });
  // The next page view re-checks install and login instead of a stale cache.
  clearClaudeCliStatusCache();
  return result;
}
