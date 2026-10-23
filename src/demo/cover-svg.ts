// Generated demo covers (D-08, T-05-11). The demo never fetches or stores a
// Discogs image: each release gets a 150x150 text tile instead, coloured from
// its release id. Every text is XML-escaped and the SVG namespace is the only
// URL in the output. Pure and deterministic.

const SIZE = 150;
const PAD = 12;
const WRAP = 18;
const MAX_LINES = 3;
const ARTIST_SIZE = 13;
const TITLE_SIZE = 14;
const LINE_GAP = 4;
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Greedy word wrap at WRAP code points, at most MAX_LINES lines. */
function wrap(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let cut = false;
  for (const word of words) {
    let w = word;
    // A word longer than a line is hard-split.
    while (Array.from(w).length > WRAP) {
      if (line) {
        lines.push(line);
        line = '';
      }
      const points = Array.from(w);
      lines.push(points.slice(0, WRAP).join(''));
      w = points.slice(WRAP).join('');
    }
    const next = line ? `${line} ${w}` : w;
    if (Array.from(next).length <= WRAP) {
      line = next;
    } else {
      lines.push(line);
      line = w;
    }
    if (lines.length > MAX_LINES) {
      cut = true;
      break;
    }
  }
  if (line && !cut) lines.push(line);
  if (lines.length > MAX_LINES) cut = true;
  const kept = lines.slice(0, MAX_LINES);
  if (cut && kept.length) {
    const i = kept.length - 1;
    const points = Array.from(kept[i]);
    kept[i] =
      points.length < WRAP
        ? `${kept[i]}…`
        : `${points
            .slice(0, WRAP - 1)
            .join('')
            .trimEnd()}…`;
  }
  return kept;
}

/** The text before the first ' - ' is the artist; the rest is the title. */
function split(title: string): { artist: string | null; title: string } {
  const at = title.indexOf(' - ');
  if (at > 0) {
    const artist = title.slice(0, at).trim();
    const rest = title.slice(at + 3).trim();
    if (artist && rest) return { artist, title: rest };
  }
  return { artist: null, title: title.trim() };
}

/** A hue spread from the release id; fixed saturation/lightness for white text. */
function background(releaseId: number): string {
  const id = Math.abs(Math.trunc(Number.isFinite(releaseId) ? releaseId : 0));
  const hue = (id * 137) % 360;
  return `hsl(${hue}, 45%, 32%)`;
}

export function coverSvg({
  releaseId,
  title,
}: {
  releaseId: number;
  title: string;
}): string {
  const parts = split(title);
  const artistLines = parts.artist ? wrap(parts.artist) : [];
  const titleLines = wrap(parts.title);
  const texts: string[] = [];
  let y = PAD;
  for (const line of artistLines) {
    y += ARTIST_SIZE;
    texts.push(
      `<text x="${PAD}" y="${y}" font-size="${ARTIST_SIZE}" font-weight="700" fill-opacity="0.85">${escapeXml(line)}</text>`,
    );
    y += LINE_GAP;
  }
  if (artistLines.length) y += LINE_GAP;
  for (const line of titleLines) {
    y += TITLE_SIZE;
    texts.push(
      `<text x="${PAD}" y="${y}" font-size="${TITLE_SIZE}">${escapeXml(line)}</text>`,
    );
    y += LINE_GAP;
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img">`,
    `<title>${escapeXml(title.trim() || 'Untitled')}</title>`,
    `<rect width="${SIZE}" height="${SIZE}" fill="${background(releaseId)}"/>`,
    `<g font-family="${FONT}" fill="#ffffff">`,
    ...texts,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
