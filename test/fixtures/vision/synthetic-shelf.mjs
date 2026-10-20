// Deterministic synthetic shelf images with known pixel boxes (D-01 item 1,
// D-02). Used by the spike calibration step, the crop tests and the fake CLI
// fixtures. Plain ESM with no imports from src, so verify scripts can use it.
//
// Every spine is a coloured bar whose text is drawn in the bar's
// text_orientation, with a solid red square at the reading-start end. After
// cropSpine rotates a crop upright, that square must sit on the left.
import sharp from 'sharp';

/**
 * @typedef {'horizontal' | 'upside_down' | 'top_to_bottom' | 'bottom_to_top'} Orientation
 * @typedef {{
 *   x1: number; y1: number; x2: number; y2: number;
 *   orientation: Orientation;
 *   artist: string; title: string; catalogNumber: string;
 *   text: string;
 * }} SyntheticSpine
 * @typedef {{
 *   name: string; width: number; height: number;
 *   quality: number; noise: number;
 *   spines: SyntheticSpine[];
 * }} Layout
 */

const ARTISTS = [
  'Nova Lane',
  'The Paper Kites',
  'Marlow Reed',
  'Echo Harbor',
  'Juniper Vale',
  'Static Bloom',
  'Owen Ashby',
  'Velvet Tide',
];
const TITLES = [
  'Blue Hour',
  'Quiet Engines',
  'North Light',
  'Glass Rivers',
  'Low Orbit',
  'Paper Moons',
  'Salt and Ember',
  'Long Way Home',
];
const ORIENTATIONS = /** @type {const} */ ([
  'horizontal',
  'upside_down',
  'top_to_bottom',
  'bottom_to_top',
]);

/**
 * @param {number} n 1-based calibration number
 * @param {[number, number, number, number]} box x1, y1, x2, y2
 * @param {Orientation} orientation
 * @returns {SyntheticSpine}
 */
function calSpine(n, [x1, y1, x2, y2], orientation) {
  const nn = String(n).padStart(2, '0');
  const artist = ARTISTS[(n - 1) % ARTISTS.length];
  const title = TITLES[(n * 3) % TITLES.length];
  return {
    x1,
    y1,
    x2,
    y2,
    orientation,
    artist,
    title,
    catalogNumber: `CAT-${1000 + n}`,
    text: `CAL-${nn} ${artist} - ${title}`,
  };
}

/** 16 spines on 1449x2576: 8 lying bars on the left, 8 standing on the right. */
function portraitSpines() {
  /** @type {SyntheticSpine[]} */
  const out = [];
  const ys = [70, 380, 690, 1000, 1330, 1660, 1990, 2400];
  ys.forEach((y, i) => {
    const x1 = 50 + (i % 3) * 40;
    const len = 680 + (i % 4) * 30;
    out.push(
      calSpine(
        i + 1,
        [x1, y, x1 + len, y + 64 + (i % 2) * 12],
        ORIENTATIONS[i % 2],
      ),
    );
  });
  const xs = [880, 1010, 1140, 1290];
  const rows = [
    [90, 1150],
    [1380, 2500],
  ];
  let n = 9;
  for (const [r, [top, bottom]] of rows.entries()) {
    for (const [j, x] of xs.entries()) {
      const w = 72 + (j % 2) * 14;
      out.push(
        calSpine(
          n,
          [x, top + j * 20, x + w, bottom - j * 15],
          ORIENTATIONS[2 + ((j + r) % 2)],
        ),
      );
      n += 1;
    }
  }
  return out;
}

/** 12 spines on 2212x1659: 6 lying bars on the left, 6 standing on the right. */
function landscapeSpines() {
  /** @type {SyntheticSpine[]} */
  const out = [];
  const ys = [80, 330, 590, 850, 1110, 1480];
  ys.forEach((y, i) => {
    const x1 = 70 + (i % 3) * 50;
    out.push(
      calSpine(
        i + 1,
        [x1, y, x1 + 880 + (i % 2) * 40, y + 78],
        ORIENTATIONS[i % 2],
      ),
    );
  });
  const xs = [1180, 1340, 1500, 1660, 1830, 2010];
  xs.forEach((x, j) => {
    out.push(
      calSpine(
        7 + j,
        [x, 70 + (j % 3) * 30, x + 92, 1580 - (j % 2) * 40],
        ORIENTATIONS[2 + (j % 2)],
      ),
    );
  });
  return out;
}

/** 6 spines on 1400x1050 (inside the tier, so resizedSize leaves it as is). */
function tracerSpines() {
  /** @type {Array<[[number, number, number, number], Orientation, string, string]>} */
  const rows = [
    [[40, 60, 700, 140], 'horizontal', 'Nova Lane', 'Blue Hour'],
    [[40, 200, 700, 280], 'upside_down', 'Echo Harbor', 'Glass Rivers'],
    [[40, 340, 700, 420], 'horizontal', 'Nova Lane', 'Blue Hour'],
    [[800, 40, 890, 1000], 'top_to_bottom', 'Juniper Vale', 'Low Orbit'],
    [[960, 40, 1050, 1000], 'bottom_to_top', 'Static Bloom', 'Paper Moons'],
    [[1120, 40, 1210, 1000], 'top_to_bottom', 'Owen Ashby', 'North Light'],
  ];
  return rows.map(([[x1, y1, x2, y2], orientation, artist, title], i) => ({
    x1,
    y1,
    x2,
    y2,
    orientation,
    artist,
    title,
    catalogNumber: `TR-${200 + (i === 2 ? 0 : i)}`,
    // Spines 0 and 2 carry identical raw text on purpose (duplicate copies).
    text: `${artist} - ${title}`,
  }));
}

/** @type {Record<'calibrationPortrait' | 'calibrationLandscape' | 'calibrationHeavy' | 'tracerShelf', Layout>} */
export const LAYOUTS = {
  calibrationPortrait: {
    name: 'calibrationPortrait',
    width: 1449,
    height: 2576,
    quality: 90,
    noise: 0,
    spines: portraitSpines(),
  },
  calibrationLandscape: {
    name: 'calibrationLandscape',
    width: 2212,
    height: 1659,
    quality: 90,
    noise: 0,
    spines: landscapeSpines(),
  },
  // Same boxes as the portrait layout, with per-pixel noise at quality 98 so
  // the JPEG is about 1.2 MB, well over 500 KB and under the 5 MB API image
  // limit (detects byte-based downsampling, A7).
  calibrationHeavy: {
    name: 'calibrationHeavy',
    width: 1449,
    height: 2576,
    quality: 98,
    noise: 3,
    spines: portraitSpines(),
  },
  tracerShelf: {
    name: 'tracerShelf',
    width: 1400,
    height: 1050,
    quality: 90,
    noise: 0,
    spines: tracerSpines(),
  },
};

const BAR_COLOURS = [
  ['#2b6cb0', '#ffffff'],
  ['#2f855a', '#ffffff'],
  ['#d69e2e', '#111111'],
  ['#6b46c1', '#ffffff'],
  ['#2c7a7b', '#ffffff'],
  ['#e2e8f0', '#111111'],
  ['#4a5568', '#ffffff'],
  ['#9ae6b4', '#111111'],
];

/** Pure red; the crop tests look for R > 180, G < 80, B < 80. */
export const MARKER_COLOUR = '#ff0000';

/** @type {Record<Orientation, number>} */
const SVG_ANGLE = {
  horizontal: 0,
  upside_down: 180,
  top_to_bottom: 90,
  bottom_to_top: -90,
};

/** @param {string} s */
function xmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Bars are drawn in a local frame (reading direction along +x, glyph tops
 * toward -y) and rotated into place, so the screen box is exactly x1..x2,
 * y1..y2 for every orientation.
 * @param {SyntheticSpine} s
 * @param {number} i
 */
function barSvg(s, i) {
  const w = s.x2 - s.x1;
  const h = s.y2 - s.y1;
  const vertical =
    s.orientation === 'top_to_bottom' || s.orientation === 'bottom_to_top';
  const long = vertical ? h : w;
  const short = vertical ? w : h;
  const cx = s.x1 + w / 2;
  const cy = s.y1 + h / 2;
  const [fill, ink] = BAR_COLOURS[i % BAR_COLOURS.length];
  const pad = Math.round(short * 0.15);
  const marker = Math.round(short * 0.55);
  const fontSize = Math.round(short * 0.42);
  const textX = -long / 2 + pad + marker + pad;
  return [
    `<g transform="translate(${cx} ${cy}) rotate(${SVG_ANGLE[s.orientation]})">`,
    `<rect x="${-long / 2}" y="${-short / 2}" width="${long}" height="${short}" fill="${fill}"/>`,
    `<rect x="${-long / 2 + pad}" y="${-marker / 2}" width="${marker}" height="${marker}" fill="${MARKER_COLOUR}"/>`,
    `<text x="${textX}" y="${Math.round(fontSize * 0.36)}" font-family="sans-serif" font-weight="bold" font-size="${fontSize}" fill="${ink}">${xmlEscape(s.text)}</text>`,
    '</g>',
  ].join('');
}

/** @param {Layout} layout */
function layoutSvg(layout) {
  const { width, height } = layout;
  return Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="${width}" height="${height}" fill="#262626"/>`,
      ...layout.spines.map(barSvg),
      '</svg>',
    ].join(''),
  );
}

/** Small deterministic PRNG (mulberry32). @param {number} seed */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Renders a layout to a JPEG.
 * @param {Layout} layout
 * @param {{ quality?: number }} [opts]
 * @returns {Promise<{ jpeg: Buffer; width: number; height: number; truth: SyntheticSpine[] }>}
 */
export async function makeSyntheticShelf(layout, opts = {}) {
  const quality = opts.quality ?? layout.quality;
  const { data, info } = await sharp(layoutSvg(layout))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (layout.noise > 0) {
    const rand = prng(0x5eed);
    const amp = layout.noise;
    for (let i = 0; i < data.length; i += 1) {
      const v = data[i] + Math.round((rand() * 2 - 1) * amp);
      data[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  const jpeg = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .jpeg({ quality, chromaSubsampling: '4:2:0' })
    .toBuffer();
  return {
    jpeg,
    width: info.width,
    height: info.height,
    truth: layout.spines.map((s) => ({ ...s })),
  };
}

/**
 * A VisionResult-shaped object carrying the truth boxes, orientations and
 * fields (confidence 0.95). Used by the fake CLI and the verify scripts.
 * @param {Layout} layout
 */
export function structuredOutputFor(layout) {
  /** @param {string | null} value */
  const read = (value) => ({ value, confidence: 0.95 });
  return {
    image_width: layout.width,
    image_height: layout.height,
    spine_count_estimate: layout.spines.length,
    spines: layout.spines.map((s, index) => ({
      index,
      media_kind: 'cd',
      bbox: [s.x1, s.y1, s.x2, s.y2],
      text_orientation: s.orientation,
      legibility: 'clear',
      raw_text: read(s.text),
      artist: read(s.artist),
      title: read(s.title),
      format: read('CD'),
      label: read(null),
      catalog_number: read(s.catalogNumber),
    })),
  };
}
