# Phase 7: Match the patrickclery.com/awesomer color palette - Context

**Gathered:** 2026-10-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Restyle the app, and the demo site, which shares its components, with the patrickclery.com/awesomer palette: Catppuccin Mocha, dark only. The change goes through the existing Tailwind v4 / shadcn theme tokens in `src/app/globals.css`, so every screen picks it up. This phase changes colors only. It adds no new features or layouts and changes no fonts.

Reference palette, captured from the live site: `07-PALETTE-REFERENCE.md`.

</domain>

<decisions>
## Implementation Decisions

### Light/dark
- Dark only, matching awesomer, which ships only `<html class="dark">` and a single Mocha `:root`. The app always renders dark, whatever the OS setting.
- No theme toggle. The OS-following light mode from Phase 1 (D-16) is retired.
- The demo site (static export) gets the same theme.

### Color mapping
- Accent and primary: mauve `#cba6f7`, with lavender `#b4befe` for hover. Text on mauve must stay readable, e.g. base `#1e1e2e` as `--primary-foreground`.
- The page background is base `#1e1e2e` and text is `#cdd6f4`. Cards, popovers and inputs use surface0 `#313244`. Borders, inputs and hover use surface1 `#45475a`. Muted text is subtext0 `#a6adc8`.
- Status colors: success green `#a6e3a1`, warning yellow `#f9e2af`, destructive red `#f38ba8`, plus sky `#89dcfe` where an info or cyan tone is needed. These cover the Imported, Fallback, low-confidence and Failed badges and lines.
- Small touches like the site: mauve text selection (`#cba6f726`), mauve focus rings and glow (`#cba6f766`), and a translucent, blurred sticky header (`bg-background/80 backdrop-blur-sm`).

### Fonts
- Colors only. Keep today's Geist Sans and Geist Mono. Do not adopt IBM Plex Sans.

### Claude's Discretion
- How each shadcn token (secondary, accent, chart-*, sidebar-*, ring and so on) maps onto the Mocha palette, as long as it stays consistent with the decisions above.
- Whether to keep the `.dark` block and force dark (next-themes `forcedTheme="dark"` / `class="dark"`), or collapse to a single `:root`. Pick whichever is least invasive and keeps the demo export working.
- Contrast fixes where a Mocha pairing fails WCAG AA for body text or badges.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/globals.css`: Tailwind v4 `@theme inline` maps about 109 CSS variables. `:root` holds light values (`--background #fafafa`, `--primary #4f46e5`) and `.dark` holds dark values (`--background #0a0a0a`, `--primary #818cf8`). `--success` and `--warning` tokens already exist.
- `src/components/theme-provider.tsx`: next-themes with `defaultTheme="system"` and `enableSystem` (Phase 1 D-16). There is no toggle.
- `src/app/layout.tsx`: Geist / Geist_Mono via next/font. The body uses `font-sans`.

### Established Patterns
- Components use the semantic tokens (`bg-background`, `text-muted-foreground`, `text-success` and so on). A grep finds no hard-coded `text-green-500`-style palette classes in `src/components`, so a token swap should recolor everything.
- The demo site is a static export of the same components (`scripts/demo/build-demo.ts`, `verify-export.ts`, `smoke.ts`).

### Integration Points
- `globals.css` tokens, the `ThemeProvider` / `<html>` class, the header component (sticky blur), and the demo build and smoke checks.

</code_context>

<specifics>
## Specific Ideas

- "Use the same color palette as patrickclery.com/awesomer." Exact tokens are in `07-PALETTE-REFERENCE.md`.

</specifics>

<deferred>
## Deferred Ideas

- Adopting awesomer's fonts (IBM Plex Sans / Geist Mono body): the owner chose colors only for now.
- A light mode (Catppuccin Latte) and a theme toggle.

</deferred>
