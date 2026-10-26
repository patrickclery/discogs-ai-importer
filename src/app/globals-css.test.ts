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
  it(':root holds exactly the 37 UI-SPEC tokens', () => {
    expect(rootVars()).toEqual(MOCHA);
    expect(Object.keys(MOCHA)).toHaveLength(37);
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

  it('@theme inline maps the new utilities and keeps the Geist fonts', () => {
    const t = themeInline();
    expect(t).toContain('--color-primary-hover: var(--primary-hover);');
    expect(t).toContain(
      '--color-destructive-foreground: var(--destructive-foreground);',
    );
    expect(t).toContain('--font-sans: var(--font-geist-sans);');
    expect(t).toContain('--font-mono: var(--font-geist-mono);');
    expect(t).not.toContain('--selection');
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
