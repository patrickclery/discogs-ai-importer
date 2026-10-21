import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

/**
 * Points SECRETS_FILE at an empty temp dir for every test file, so no test
 * reads (or writes) the owner's real secrets.json at the project root. A
 * connected Discogs account there would otherwise turn not_connected
 * searches into queued ones. Tests that need secrets set their own file.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-test-secrets-'));
process.env.SECRETS_FILE = path.join(dir, 'secrets.json');

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
