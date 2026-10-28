# Phase 7 reference: patrickclery.com/awesomer palette

Captured 2026-10-25 from https://patrickclery.com/awesomer/ (stylesheet `/awesomer/_next/static/chunks/485522ad1d2d8ce0.css`).

## Color tokens (the site's `:root`)

The site is dark-only: `<html class="dark">`, a single `:root` block, and no `prefers-color-scheme` rules. The palette is Catppuccin Mocha.

| Token | Value | Catppuccin name |
|---|---|---|
| --background | #1e1e2e | base |
| --foreground | #cdd6f4 | text |
| --accent | #cba6f7 | mauve |
| --accent-hover | #b4befe | lavender |
| --surface | #313244 | surface0 |
| --surface-hover | #45475a | surface1 |
| --border | #45475a | surface1 |
| --muted | #a6adc8 | subtext0 |
| --success | #a6e3a1 | green |
| --danger | #f38ba8 | red |
| --warning | #f9e2af | yellow |
| --cyan | #89dcfe | sky-ish |
| --glow-color | #cba6f766 | mauve at 40% |
| --selection-bg | #cba6f726 | mauve at 15% |

## Typography

- The body is mostly IBM Plex Sans (36 uses).
- The default and mono font is Geist Mono (`--default-font-family: var(--font-geist-mono)`).
- There is also an "asciimono" display font.
- Header: `border-b border-border bg-background/80 backdrop-blur-sm sticky top-0`.

## App today (for mapping)

`src/app/globals.css` defines shadcn tokens in two places: `:root`, which is light (`--background #fafafa`, `--primary #4f46e5`), and `.dark` (`--background #0a0a0a`, `--primary #818cf8`).

## Open questions for discuss

- Dark-only like the site, or keep a light mode built from Catppuccin Latte?
- Should the fonts change too (IBM Plex Sans / Geist Mono), or only the colors?
- Map accent (mauve) to shadcn `--primary`, and the status colors (green, red, yellow) to the success, destructive and warning badges?
