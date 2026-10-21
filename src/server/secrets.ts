import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { dataRoot } from './storage/paths';

// Secrets storage (D-08, D-09, D-11). Values live in secrets.json at the
// project root (or SECRETS_FILE), never inside DATA_DIR and never in app.db.
// Everything is read at call time so env overrides apply without a restart.
// No function here logs or returns a raw value except getSecret(), which is
// reserved for server-side API clients (Phase 3).

export const SECRET_KEYS = [
  'discogsConsumerKey',
  'discogsConsumerSecret',
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export const SECRET_ENV_NAMES: Record<SecretKey, string> = {
  discogsConsumerKey: 'DISCOGS_CONSUMER_KEY',
  discogsConsumerSecret: 'DISCOGS_CONSUMER_SECRET',
};

const SECRET_LABELS: Record<SecretKey, string> = {
  discogsConsumerKey: 'Consumer key',
  discogsConsumerSecret: 'Consumer secret',
};

export type SecretStatus = {
  key: SecretKey;
  label: string;
  envName: string;
  configured: boolean;
  source: 'env' | 'file' | null;
  masked: string | null;
  fileValueExists: boolean;
};

/** secrets.json problems. Messages never include file content. */
export class SecretsFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsFileError';
  }
}

const FileSchema = z.record(z.string(), z.string());
type SecretsMap = Record<string, string>;

/** Absolute secrets file path; refuses any path inside DATA_DIR. */
export function secretsFile(): string {
  const file = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.SECRETS_FILE || 'secrets.json',
  );
  const root = dataRoot();
  if (file === root || file.startsWith(root + path.sep)) {
    throw new SecretsFileError('SECRETS_FILE must be outside DATA_DIR');
  }
  return file;
}

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

function readFileMap(file: string): SecretsMap {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return {};
    throw new SecretsFileError(
      err instanceof Error ? err.message : 'unreadable file',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON.parse messages quote the input, so they are never surfaced.
    throw new SecretsFileError('the file is not valid JSON');
  }
  const result = FileSchema.safeParse(parsed);
  if (!result.success) {
    throw new SecretsFileError('the file must map names to string values');
  }
  return result.data;
}

function writeFileMap(file: string, map: SecretsMap): void {
  const tmp = path.join(
    /* turbopackIgnore: true */ path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(map, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best effort
    }
    throw err;
  }
  fs.chmodSync(file, 0o600);
}

function envValue(key: SecretKey): string | null {
  const v = process.env[SECRET_ENV_NAMES[key]]?.trim();
  return v ? v : null;
}

/** Effective value: non-empty env, then file, then null. Server-side use only. */
export function getSecret(key: SecretKey): string | null {
  const env = envValue(key);
  if (env) return env;
  const v = readFileMap(secretsFile())[key];
  return v ? v : null;
}

/** '••••' for values of 8 chars or fewer, else '…' plus the last 4. */
export function mask(value: string): string {
  if (value.length <= 8) return '••••';
  return `…${value.slice(-4)}`;
}

/** Masked DTOs, safe to render. */
export function listSecretStatus(): SecretStatus[] {
  const file = readFileMap(secretsFile());
  return SECRET_KEYS.map((key) => {
    const env = envValue(key);
    const fileValue = file[key] ? file[key] : null;
    const effective = env ?? fileValue;
    return {
      key,
      label: SECRET_LABELS[key],
      envName: SECRET_ENV_NAMES[key],
      configured: effective !== null,
      source: env ? 'env' : fileValue ? 'file' : null,
      masked: effective === null ? null : mask(effective),
      fileValueExists: fileValue !== null,
    };
  });
}

// saveSecrets and clearSecret are fully synchronous read-modify-write, so two
// Server Actions in one process can never interleave between read and write.

export function saveSecrets(values: Partial<Record<SecretKey, string>>): void {
  const file = secretsFile();
  const current = readFileMap(file);
  const next: SecretsMap = { ...current };
  let changed = false;
  for (const key of SECRET_KEYS) {
    const v = values[key];
    if (v === undefined) continue;
    if (next[key] !== v) {
      next[key] = v;
      changed = true;
    }
  }
  if (!changed) return;
  writeFileMap(file, next);
}

export function clearSecret(key: SecretKey): void {
  const file = secretsFile();
  const current = readFileMap(file);
  if (!(key in current)) return;
  const next: SecretsMap = { ...current };
  delete next[key];
  writeFileMap(file, next);
}

// updateSecretsFile and readSecretsFileKey exist only for
// src/server/discogs/auth.ts: the OAuth token keys live in the same file but
// are never part of SECRET_KEYS, so the editable credentials form never lists
// them (RESEARCH Pattern 1).

/**
 * Synchronous read-modify-write of the secrets file (temp + rename, 0600).
 * The mutator gets a copy; returning null or an unchanged map writes nothing.
 */
export function updateSecretsFile(
  mutate: (current: Record<string, string>) => Record<string, string> | null,
): void {
  const file = secretsFile();
  const current = readFileMap(file);
  const next = mutate({ ...current });
  if (next === null) return;
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  let changed = false;
  for (const k of keys) {
    if (current[k] !== next[k]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  writeFileMap(file, next);
}

/** One raw value from the secrets file (no env override), or null. */
export function readSecretsFileKey(name: string): string | null {
  const v = readFileMap(secretsFile())[name];
  return v ? v : null;
}
