// Phase 5 cover builder (D-08). Offline, developer-run:
//
//   pnpm demo:covers
//
// Writes one generated SVG tile per release id in demo/fixtures/discogs.json
// (every candidate plus the canned release) to demo/assets/covers. No
// Discogs image is fetched or stored.
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { coverSvg } from '@/demo/cover-svg';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DISCOGS = path.join(ROOT, 'demo/fixtures/discogs.json');
const COVERS = path.join(ROOT, 'demo/assets/covers');

type Titled = { releaseId: number; title: string };

it('builds one cover per recorded release', () => {
  const rec = JSON.parse(fs.readFileSync(DISCOGS, 'utf8')) as {
    spines: Record<string, { candidates: Titled[] }>;
    canned: Titled;
  };
  const byId = new Map<number, string>();
  for (const r of Object.values(rec.spines)) {
    for (const c of r.candidates) {
      if (!byId.has(c.releaseId)) byId.set(c.releaseId, c.title);
    }
  }
  if (!byId.has(rec.canned.releaseId)) {
    byId.set(rec.canned.releaseId, rec.canned.title);
  }

  fs.rmSync(COVERS, { recursive: true, force: true });
  fs.mkdirSync(COVERS, { recursive: true });
  for (const [releaseId, title] of [...byId].sort((a, b) => a[0] - b[0])) {
    if (!Number.isSafeInteger(releaseId) || releaseId <= 0) {
      throw new Error(`invalid release id ${releaseId}`);
    }
    fs.writeFileSync(
      path.join(COVERS, `${releaseId}.svg`),
      coverSvg({ releaseId, title }),
    );
  }
  console.log(`demo:covers ${byId.size} covers`);
  expect(fs.readdirSync(COVERS)).toHaveLength(byId.size);
});
