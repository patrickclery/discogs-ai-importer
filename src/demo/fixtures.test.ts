import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SPINE_FIELDS } from '@/lib/vision-contract';

// D-06, D-07, D-18 / T-05-04 / T-05-13: the committed demo fixtures are the
// owner's cd-spines shelf only, made by the real pipeline, downscaled and
// metadata-free.

const ROOT = path.resolve(import.meta.dirname, '../..');
const DEMO = path.join(ROOT, 'demo');
const ASSETS = path.join(DEMO, 'assets');
const SHELF_FILE = path.join(DEMO, 'fixtures/shelf.json');
const SAVED_READ = path.join(
  ROOT,
  'test/fixtures/vision/spike/cd-spines.claude-opus-5-5.high.json',
);

const CROPS_MAX_BYTES = 1_650_000;
const CROP_MAX_EDGE = 1200;

type ShelfSpine = {
  key: string;
  index: number;
  crop: { file: string; width: number; height: number } | null;
  fields: Array<{ field: string; value: string | null; confidence: number }>;
};
type Shelf = {
  source: { read: string; model: string; effort: string };
  photo: {
    filename: string;
    sentW: number;
    sentH: number;
    detectedCount: number;
    vision: string;
    thumb: string;
  };
  spines: ShelfSpine[];
};

type SavedSpine = Record<string, unknown>;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function savedSpines(): SavedSpine[] {
  const rec = readJson<{ run: { stdout: string } }>(SAVED_READ);
  const env = JSON.parse(rec.run.stdout) as {
    structured_output: { spines: SavedSpine[] };
  };
  return env.structured_output.spines;
}

async function expectNoMetadata(file: string): Promise<void> {
  const meta = await sharp(file).metadata();
  expect(meta.exif, `${file} exif`).toBeUndefined();
  expect(meta.icc, `${file} icc`).toBeUndefined();
  expect(meta.xmp, `${file} xmp`).toBeUndefined();
}

describe('sample shelf fixture (D-07)', () => {
  it('holds the 61 spines of the saved read, in detection order', () => {
    const shelf = readJson<Shelf>(SHELF_FILE);
    const saved = savedSpines();
    expect(shelf.source.read).toBe('cd-spines.claude-opus-5-5.high');
    expect(shelf.photo.filename).toBe('cd-spines.heic');
    expect(shelf.spines).toHaveLength(61);
    expect(shelf.photo.detectedCount).toBe(61);
    const keys = shelf.spines.map((s) => s.key);
    expect(new Set(keys).size).toBe(61);
    expect(keys).toEqual(
      Array.from({ length: 61 }, (_, i) => String(i).padStart(2, '0')),
    );
    shelf.spines.forEach((spine, i) => {
      expect(spine.fields.map((f) => f.field)).toEqual([...SPINE_FIELDS]);
      for (const f of spine.fields) {
        const read = saved[i][f.field] as {
          value: string | null;
          confidence: number;
        };
        expect(f.value).toBe(read.value);
        expect(f.confidence).toBe(read.confidence);
      }
    });
  });

  it('has the exact vision image Claude saw (1449x2576)', async () => {
    const shelf = readJson<Shelf>(SHELF_FILE);
    const rec = readJson<{ image: { sentW: number; sentH: number } }>(
      SAVED_READ,
    );
    expect(shelf.photo.sentW).toBe(rec.image.sentW);
    expect(shelf.photo.sentH).toBe(rec.image.sentH);
    const meta = await sharp(path.join(ASSETS, shelf.photo.vision)).metadata();
    expect([meta.width, meta.height]).toEqual([1449, 2576]);
    expect(fs.existsSync(path.join(ASSETS, shelf.photo.thumb))).toBe(true);
  });

  it('has a downscaled crop per spine matching shelf.json, under budget (D-18)', async () => {
    const shelf = readJson<Shelf>(SHELF_FILE);
    let total = 0;
    const named = new Set<string>();
    for (const spine of shelf.spines) {
      if (!spine.crop) continue;
      const file = path.join(ASSETS, spine.crop.file);
      named.add(path.resolve(file));
      expect(fs.existsSync(file), spine.crop.file).toBe(true);
      const meta = await sharp(file).metadata();
      expect([meta.width, meta.height]).toEqual([
        spine.crop.width,
        spine.crop.height,
      ]);
      expect(Math.max(spine.crop.width, spine.crop.height)).toBeLessThanOrEqual(
        CROP_MAX_EDGE,
      );
      total += fs.statSync(file).size;
    }
    expect(total).toBeLessThan(CROPS_MAX_BYTES);
    const onDisk = walk(path.join(ASSETS, 'crops')).map((f) => path.resolve(f));
    expect(onDisk.sort()).toEqual([...named].sort());
  });

  it('publishes no EXIF, ICC or XMP metadata (T-05-04)', async () => {
    const shelf = readJson<Shelf>(SHELF_FILE);
    await expectNoMetadata(path.join(ASSETS, shelf.photo.vision));
    await expectNoMetadata(path.join(ASSETS, shelf.photo.thumb));
    for (const spine of shelf.spines) {
      if (spine.crop)
        await expectNoMetadata(path.join(ASSETS, spine.crop.file));
    }
  });
});

describe('demo folder privacy (D-06, T-05-13)', () => {
  it('holds no HEIC file and no reference to the IMG_35xx photos', () => {
    const files = walk(DEMO);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file, 'HEIC under demo/').not.toMatch(/\.hei[cf]$/i);
      expect(path.basename(file)).not.toMatch(/img[-_]?35/i);
      const text = fs.readFileSync(file).toString('latin1');
      expect(text.includes('IMG_35'), `${file} mentions IMG_35`).toBe(false);
      expect(text.includes('img-35'), `${file} mentions img-35`).toBe(false);
    }
  });
});
