---
status: testing
phase: 07-match-the-patrickclery-com-awesomer-color-palette
source: [07-VERIFICATION.md]
started: 2026-10-26T02:57:31.802Z
updated: 2026-10-26T02:57:31.802Z
---

## Current Test

number: 1
name: Set your computer to light mode. Start the app and open the Upload page, then the Spines page and the Settings page. Reload each page a few times.
expected: |
  Every page has a dark navy-purple background with soft off-white text, even though the computer is in light mode. Cards and panels are a slightly lighter slate-purple with thin grey-purple borders. Reloading never shows a white flash. There is no light/dark switch anywhere. The lettering looks exactly as before.
awaiting: user response

## Tests

### 1. Set your computer to light mode. Start the app and open the Upload page, then the Spines page and the Settings page. Reload each page a few times.
expected: Every page has a dark navy-purple background with soft off-white text, even though the computer is in light mode. Cards and panels are a slightly lighter slate-purple with thin grey-purple borders. Reloading never shows a white flash. There is no light/dark switch anywhere. The lettering looks exactly as before.
result: [pending]

### 2. On the Spines page in Detailed view, scroll so a bright, light-colored spine photo slides under the bar at the top of the page.
expected: The top bar is slightly see-through and the photo shows through it, softly blurred. The words Upload, Spines and Settings stay easy to read even over the bright photo.
result: [pending]

### 3. In Settings, change Preferred country and save, then change it back and save again (computer still in light mode).
expected: The confirmation pop-up in the bottom-right corner is dark slate with light text and a thin border, never white.
result: [pending]

### 4. On the Spines page, tick a couple of cards so the bottom bar appears and hover its Import button. Then open each warning dialog without confirming: Dismiss on a card (then Keep spine), Disconnect Discogs in Settings (then Stay connected), and Clear value next to a saved Discogs key (then Keep value). Hover the red button in each dialog.
expected: The Import button is light purple with dark text and turns a bluish lavender under the mouse. In all three dialogs the confirm button is solid pink-red with dark text and gets slightly deeper red under the mouse. The text is never white, and Clear value is never purple. Nothing is actually dismissed, disconnected or cleared.
result: [pending]

### 5. On the Spines page, look at the row of status tabs (All is selected when the page opens). Move the mouse over other tabs. If a spine has failed, look at the Failed tab, then click it. Also hover and click Needs review and Fallback if they show.
expected: On the selected tab the number is bright off-white and easy to read, not faded grey. Hovering a tab brightens its number the same way. The Failed number is red when the tab is not selected and turns off-white once you hover or select it. Filtering works exactly as before.
result: [pending]

### 6. Hover the underlined purple links: in Settings, the links in the Discogs card; on the Spines page (Detailed view), the Discogs links under a match or a confirmed match. Then select some text on the page with the mouse, and also select some text you typed into a box (for example the search box on the Spines page or a field in Settings). Finally press Tab a few times to move between buttons and fields.
expected: Each link is light purple and turns bluish lavender under the mouse, staying underlined. Selected text gets a faint purple highlight and keeps its own color, both on the page and inside a typing box (never a solid purple block). The outline that shows which button or field you are on is purple.
result: [pending]

### 7. Open the published demo site (or a fresh demo build) and visit its first page, Spines and Settings.
expected: The demo looks the same as the app: dark navy-purple, light text, purple buttons, no white flash, no white page anywhere, including the very first page you land on.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
- gap_id: G-07-style-1
  truth: "The app has awesomer's overall terminal/markdown look, not just its colors: gradient cards (.card-featured / .card-mini), a large faint number in each card's bottom-right corner, awesomer's fonts (Geist Mono UI, IBM Plex Sans prose, an asciiMono ASCII-art wordmark), CRT scanlines, gradient-text titles and markdown-style section headings"
  status: failed
  reason: "User reported: I can already tell that it's not really the same. For instance, you don't use gradients on the cards, whereas if you look at Awesomer, it's using gradients. Awesomer also puts the number in the corner of the card like on the main page you can see agent skills 6, MCP server 7, etc. I also think it should use that same ASCII type of font that is on all the pages. And we might as well make the font migration part of this too. It should use the same fonts. I think it would be cool if it had the overall type of vibe that Awesomer has where it's sort of like a terminal slash markdown."
  severity: major
  test: 0
  root_cause: "Phase 7 was scoped as colors only (07-CONTEXT original decision). Awesomer's look also depends on card gradients and glows, corner numerals, Geist Mono / IBM Plex Sans / asciiMono fonts, scanlines and gradient-text. See reference/awesomer-style-rules.css and reference/awesomer-home.html."
  artifacts:
    - path: "src/app/globals.css"
      issue: "no card gradient, glow, scanline, gradient-text or font utilities"
    - path: "src/app/layout.tsx"
      issue: "loads Geist Sans as the body font; no IBM Plex Sans or asciiMono"
    - path: "src/components/compact-spine-card.tsx"
      issue: "flat card surface, no corner numeral"
  missing:
    - "Card gradient and glow treatment and corner numerals on spine and photo cards"
    - "Font migration: Geist Mono default, IBM Plex Sans for prose, asciiMono wordmark (local font from reference/ascii_mono.woff2)"
    - "Scanline overlay, gradient-text titles, markdown-style headings (## …)"
