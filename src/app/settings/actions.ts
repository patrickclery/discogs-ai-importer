'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  clearSecret,
  SECRET_KEYS,
  type SecretKey,
  saveSecrets,
} from '@/server/secrets';

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
    saveSecrets(values);
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
  } catch (err) {
    return { ok: false, formError: ioError(err) };
  }
  revalidatePath('/settings');
  return { ok: true };
}
