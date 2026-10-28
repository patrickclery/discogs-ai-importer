import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase 7: one Catppuccin Mocha :root, dark only (07-UI-SPEC token table).
// The token map, the leftovers it replaced and the AA contrast pairings are
// all read from globals.css, so a later edit cannot drift silently.

const css = fs.readFileSync(
  path.join(import.meta.dirname, 'globals.css'),
  'utf8',
);

function rootBlock(): string {
  const m = css.match(/^:root\s*\{([^}]*)\}/m);
  if (!m) throw new Error(':root block not found');
  return m[1];
}

function rootVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of rootBlock().matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

function themeInline(): string {
  const m = css.match(/@theme inline\s*\{([^}]*)\}/);
  if (!m) throw new Error('@theme inline block not found');
  return m[1];
}

const MOCHA = {
  '--radius': '0.625rem',
  '--background': '#1e1e2e',
  '--foreground': '#cdd6f4',
  '--card': '#313244',
  '--card-foreground': '#cdd6f4',
  '--popover': '#313244',
  '--popover-foreground': '#cdd6f4',
  '--primary': '#cba6f7',
  '--primary-foreground': '#1e1e2e',
  '--primary-hover': '#b4befe',
  '--secondary': '#45475a',
  '--secondary-foreground': '#cdd6f4',
  '--muted': '#181825',
  '--muted-foreground': '#a6adc8',
  '--accent': '#45475a',
  '--accent-foreground': '#cdd6f4',
  '--destructive': '#f38ba8',
  '--destructive-foreground': '#1e1e2e',
  '--border': '#45475a',
  '--input': '#45475a',
  '--ring': '#cba6f7',
  '--chart-1': '#cba6f7',
  '--chart-2': '#89dcfe',
  '--chart-3': '#a6e3a1',
  '--chart-4': '#f9e2af',
  '--chart-5': '#f38ba8',
  '--sidebar': '#181825',
  '--sidebar-foreground': '#cdd6f4',
  '--sidebar-primary': '#cba6f7',
  '--sidebar-primary-foreground': '#1e1e2e',
  '--sidebar-accent': '#45475a',
  '--sidebar-accent-foreground': '#cdd6f4',
  '--sidebar-border': '#45475a',
  '--sidebar-ring': '#cba6f7',
  '--success': '#a6e3a1',
  '--warning': '#f9e2af',
  '--selection': '#cba6f726',
  '--glow': '#cba6f766',
  '--cyan': '#89dcfe',
};

/** WCAG 2.x relative luminance of an opaque #rrggbb color. */
function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`not an opaque #rrggbb color: ${hex}`);
  const [r, g, b] = m.slice(1).map((h) => {
    const c = Number.parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque colors. */
function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

describe('globals.css: Catppuccin Mocha tokens (Phase 7)', () => {
  it(':root holds exactly the 39 UI-SPEC tokens', () => {
    expect(rootVars()).toEqual(MOCHA);
    expect(Object.keys(MOCHA)).toHaveLength(39);
  });

  it(':root declares color-scheme: dark', () => {
    expect(rootBlock()).toMatch(/(^|[;\s])color-scheme:\s*dark;/);
  });

  it('has no dark-class block, OKLCH value or old light/neutral value', () => {
    expect(css).not.toMatch(/^\.dark\s*\{/m);
    expect(css).not.toContain('oklch(');
    for (const old of [
      '#fafafa',
      '#0a0a0a',
      '#4f46e5',
      '#818cf8',
      '#ffffff1a',
    ]) {
      expect(css.toLowerCase()).not.toContain(old);
    }
    expect(css).not.toContain('prefers-color-scheme');
  });

  it('@theme inline maps the new utilities and the Geist Mono and Plex fonts', () => {
    const t = themeInline();
    expect(t).toContain('--color-primary-hover: var(--primary-hover);');
    expect(t).toContain(
      '--color-destructive-foreground: var(--destructive-foreground);',
    );
    expect(t).toContain('--font-sans: var(--font-geist-mono);');
    expect(t).toContain('--font-mono: var(--font-geist-mono);');
    expect(t).toContain('--font-prose: var(--font-ibm-plex-sans);');
    expect(t).not.toContain('--font-geist-sans');
    expect(t).not.toContain('--selection');
    expect(t).not.toContain('--glow');
    expect(t).not.toContain('--cyan');
  });

  it('keeps the dark custom variant for the shadcn dark: utilities', () => {
    expect(css).toContain('@custom-variant dark (&:is(.dark *));');
  });

  it('::selection tints the background only', () => {
    const m = css.match(/::selection\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    const body = m?.[1] ?? '';
    expect(body).toMatch(/background-color:\s*var\(--selection\)/);
    expect(body).not.toMatch(/(^|[\s;])color\s*:/);
  });
});

describe('globals.css: WCAG contrast (Phase 7)', () => {
  it('contrastRatio matches the UI-SPEC figures', () => {
    expect(round2(contrastRatio('#cdd6f4', '#1e1e2e'))).toBe(11.34);
    // Known failures fixed by later plans (UI-SPEC C-1, C-3).
    expect(round2(contrastRatio('#ffffff', '#f38ba8'))).toBe(2.32);
    expect(round2(contrastRatio('#a6adc8', '#45475a'))).toBe(4.1);
  });

  const PAIRS: Array<[string, string]> = [
    ['--foreground', '--background'],
    ['--card-foreground', '--card'],
    ['--popover-foreground', '--popover'],
    ['--secondary-foreground', '--secondary'],
    ['--accent-foreground', '--accent'],
    ['--muted-foreground', '--background'],
    ['--muted-foreground', '--card'],
    ['--muted-foreground', '--muted'],
    ['--primary-foreground', '--primary'],
    ['--primary-foreground', '--primary-hover'],
    ['--destructive-foreground', '--destructive'],
    ['--primary', '--card'],
    ['--primary-hover', '--card'],
    ['--destructive', '--card'],
    ['--success', '--card'],
    ['--warning', '--card'],
    ['--chart-2', '--card'],
  ];

  it.each(PAIRS)('%s on %s reaches AA (4.5:1)', (fg, bg) => {
    const vars = rootVars();
    expect(vars[fg]).toBeDefined();
    expect(vars[bg]).toBeDefined();
    expect(contrastRatio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

const read = (rel: string) =>
  fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');

/** One rule body, whitespace collapsed so formatter line breaks don't matter. */
function ruleBody(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`${selector} rule not found`);
  return m[1]
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');
}

describe('fonts wiring (Phase 7 v2)', () => {
  it('fonts.ts loads Geist Mono, Plex 400 and the local asciiMono', () => {
    const src = read('fonts.ts');
    for (const s of [
      'Geist_Mono',
      'IBM_Plex_Sans',
      'localFont',
      "'./fonts/ascii_mono.woff2'",
      '--font-geist-mono',
      '--font-ibm-plex-sans',
      '--font-ascii-mono',
      "weight: '400'",
      "display: 'block'",
    ]) {
      expect(src).toContain(s);
    }
  });

  // next/font defaults to a size-adjusted local(Arial) fallback, which is
  // proportional, so the mono UI font and the box-drawing wordmark would
  // first paint (or fail over) in Arial. Both mono fonts opt out of it and
  // fall back to real monospace faces instead.
  for (const name of ['geistMono', 'asciiMono']) {
    it(`${name} falls back to monospace, not the Arial metric fallback`, () => {
      const src = read('fonts.ts');
      const m = src.match(
        new RegExp(`export const ${name} = \\w+\\(\\{([\\s\\S]*?)\\}\\);`),
      );
      if (!m) throw new Error(`${name} font call not found`);
      expect(m[1]).toContain('adjustFontFallback: false,');
      expect(m[1]).toMatch(/fallback: \[[^\]]*'monospace',?\s*\]/);
    });
  }

  // The wordmark font's variable sits on <html> in the root layout, so by
  // default next/font preloads it on every route. Only /upload (>=640px)
  // draws the wordmark, so the preload is disabled.
  it('asciiMono is not preloaded on every route', () => {
    const src = read('fonts.ts');
    const m = src.match(/export const asciiMono = \w+\(\{([\s\S]*?)\}\);/);
    if (!m) throw new Error('asciiMono font call not found');
    expect(m[1]).toContain('preload: false,');
  });

  for (const layout of ['layout.tsx', 'layout.demo.tsx']) {
    it(`${layout} uses the shared fonts and no Geist Sans`, () => {
      const src = read(layout);
      expect(src).toContain(
        "import { asciiMono, geistMono, plexSans } from './fonts';",
      );
      expect(src).toContain(
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal className template
        'className={`dark ${geistMono.variable} ${plexSans.variable} ${asciiMono.variable} h-full antialiased`}',
      );
      expect(src).not.toContain('geistSans');
      expect(src).not.toContain('--font-geist-sans');
    });
  }
});

describe('asciiMono font file and license (Phase 7 v2)', () => {
  it('is the byte-identical 7,032-byte capture', () => {
    const buf = fs.readFileSync(
      path.join(import.meta.dirname, 'fonts/ascii_mono.woff2'),
    );
    expect(buf.length).toBe(7032);
    expect(createHash('sha256').update(buf).digest('hex')).toBe(
      '756de50e06e4438e37dd4bfc887e58aa7f76cd7d5e7da0710a13d45d43a1b382',
    );
  });

  it('ships beside the SIL OFL 1.1 with the Noto copyright', () => {
    const ofl = read('fonts/OFL.txt');
    expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(ofl).toContain('The Noto Project Authors');
    expect(ofl).not.toContain('Open Sans');
  });
});

describe('awesomer card rules (Phase 7 v2)', () => {
  const GRADIENT =
    'linear-gradient(180deg, var(--card) 0%, color-mix(in srgb, var(--card) 45%, var(--background)) 100%)';

  it('.card-mini is the gradient with a faint border, mauve on hover', () => {
    const mini = ruleBody('.card-mini');
    expect(mini).toContain(`background: ${GRADIENT};`);
    expect(mini).toContain(
      'border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);',
    );
    expect(ruleBody('.card-mini:hover')).toContain(
      'border-color: color-mix(in srgb, var(--primary) 40%, transparent);',
    );
  });

  it('.card-featured has a half-mauve border, solid mauve on hover', () => {
    const featured = ruleBody('.card-featured');
    expect(featured).toContain(`background: ${GRADIENT};`);
    expect(featured).toContain(
      'border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent);',
    );
    expect(ruleBody('.card-featured:hover')).toContain(
      'border-color: var(--primary);',
    );
  });

  it('no card rule moves or scales the card', () => {
    for (const sel of [
      '.card-mini',
      '.card-mini:hover',
      '.card-featured',
      '.card-featured:hover',
    ]) {
      expect(ruleBody(sel)).not.toContain('transform');
    }
  });
});

/** The body of an at-rule block such as `@media (…)`, nested braces kept. */
function atBlock(prelude: string): string {
  const start = css.indexOf(`${prelude} {`);
  if (start < 0) throw new Error(`${prelude} block not found`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) {
      return css.slice(css.indexOf('{', start) + 1, i).replace(/\s+/g, ' ');
    }
  }
  throw new Error(`${prelude} block not closed`);
}

/** sRGB color-mix(a p%, b) of two opaque #rrggbb colors, as #rrggbb. */
function mix(a: string, b: string, p: number): string {
  const ch = (hex: string, i: number) =>
    Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(ch(a, i) * p + ch(b, i) * (1 - p))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

describe('awesomer terminal look (Phase 7 v2)', () => {
  it('v2 pairings reach AA, including on the card gradient end', () => {
    const v = rootVars();
    const end = mix(v['--card'], v['--background'], 0.85);
    expect(end).toBe('#2e2f41');
    expect(
      contrastRatio(v['--cyan'], v['--background']),
    ).toBeGreaterThanOrEqual(4.5);
    for (const fg of [
      '--foreground',
      '--muted-foreground',
      '--destructive',
      '--primary',
    ]) {
      expect(contrastRatio(v[fg], end)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('body::before draws click-through CRT scanlines over every page', () => {
    const b = ruleBody('body::before');
    for (const decl of [
      'content: "";',
      'position: fixed;',
      'inset: 0;',
      'z-index: 9999;',
      'pointer-events: none;',
      'repeating-linear-gradient(0deg, #0000 0 1px, #0000000a 1px 2px)',
    ]) {
      expect(b).toContain(decl);
    }
  });

  it('.gradient-text runs mauve to cyan through the text', () => {
    const g = ruleBody('.gradient-text');
    expect(g).toContain('linear-gradient(135deg, var(--primary), var(--cyan))');
    expect(g).toContain('background-clip: text;');
    expect(g).toContain('-webkit-text-fill-color: transparent;');
  });

  it('.glow and .glow-intense are text shadows on the glow tokens', () => {
    expect(ruleBody('.glow')).toContain('text-shadow: 0 0 8px var(--glow);');
    expect(ruleBody('.glow-intense')).toMatch(
      /text-shadow: 0 0 4px var\(--primary\),/,
    );
  });

  it('.cursor-blink blinks 5 times, never forever', () => {
    expect(ruleBody('.cursor-blink')).toContain(
      'animation: blink 1s step-end 5;',
    );
    expect(css).not.toMatch(/blink[^;]*infinite/);
    expect(atBlock('@keyframes blink')).toMatch(/50% \{ opacity: 0; \}/);
  });

  it('.ascii-art sets the asciiMono font, unwrapped at 11px', () => {
    const a = ruleBody('.ascii-art');
    for (const decl of [
      'font-family: var(--font-ascii-mono), monospace;',
      'white-space: pre;',
      'letter-spacing: 0;',
      'font-size: 11px;',
      'line-height: 1;',
    ]) {
      expect(a).toContain(decl);
    }
  });

  it('reduced motion stops the cursor and the card transitions', () => {
    const r = atBlock('@media (prefers-reduced-motion: reduce)');
    expect(r).toMatch(/\.cursor-blink \{ animation: none; \}/);
    expect(r).toMatch(/\.card-featured,\s*\.card-mini \{ transition: none; \}/);
  });

  it('print and forced colors hide the scanlines; forced colors flattens gradient text', () => {
    expect(atBlock('@media print, (forced-colors: active)')).toMatch(
      /body::before \{ display: none; \}/,
    );
    const fc = atBlock('@media (forced-colors: active)');
    expect(fc).toContain('.gradient-text');
    expect(fc).toContain('background: none;');
    expect(fc).toContain('-webkit-text-fill-color: currentColor;');
  });
});
