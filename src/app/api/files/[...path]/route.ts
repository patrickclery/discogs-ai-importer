import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { connection } from 'next/server';
import { resolveData } from '@/server/storage/paths';

// Allowlisted streaming of derived images (RESEARCH Pattern 8, T-02-06).
// Only crops, thumbnails and vision images, only .webp and .jpg. Originals
// under photos/, raw.json and anything outside DATA_DIR are a plain 404.

const ROOTS = new Set(['crops', 'thumbs', 'vision']);
const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Each segment is one plain name: no separators, dot segments or NUL. */
function safeSegment(s: string): boolean {
  return (
    s.length > 0 &&
    s !== '.' &&
    s !== '..' &&
    !s.includes('/') &&
    !s.includes('\\') &&
    !s.includes('\0')
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  await connection();
  const segments = (await params).path ?? [];
  if (segments.length < 2 || !segments.every(safeSegment)) return notFound();
  const [root] = segments;
  if (!ROOTS.has(root)) return notFound();
  const rel = segments.join('/');
  const type = TYPES[path.extname(rel).toLowerCase()];
  if (!type) return notFound();

  let abs: string;
  let rootAbs: string;
  try {
    abs = resolveData(rel);
    rootAbs = resolveData(root);
  } catch {
    return notFound();
  }
  if (!abs.startsWith(rootAbs + path.sep)) return notFound();

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(abs);
  } catch {
    return notFound();
  }
  if (!stat.isFile()) return notFound();

  const body = Readable.toWeb(fs.createReadStream(abs)) as ReadableStream;
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(stat.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
