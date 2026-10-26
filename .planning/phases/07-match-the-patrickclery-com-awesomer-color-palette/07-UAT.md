---
status: testing
phase: 07-match-the-patrickclery-com-awesomer-color-palette
source: [07-VERIFICATION.md]
started: 2026-10-26T02:57:31.802Z
updated: 2026-10-26T08:58:48.549Z
---

## Current Test

number: 1
name: Open the app at http://127.0.0.1:3001 and visit Upload, Spines and Settings. Reload each page a few times. Then look closely at a plain part of the page.
expected: |
  Every page has a dark navy-purple background with soft off-white text. Cards are a slightly lighter slate-purple. Reloading never flashes white, and there is no light/dark switch anywhere. All titles, labels, buttons and numbers use a typewriter-style font where every letter is the same width. Very faint horizontal lines cover the whole page, like an old computer monitor. Clicking, typing and dragging still work normally through them.
awaiting: user response

## Tests

### 1. Open the app at http://127.0.0.1:3001 and visit Upload, Spines and Settings. Reload each page a few times. Then look closely at a plain part of the page.
expected: Every page has a dark navy-purple background with soft off-white text. Cards are a slightly lighter slate-purple. Reloading never flashes white, and there is no light/dark switch anywhere. All titles, labels, buttons and numbers use a typewriter-style font where every letter is the same width. Very faint horizontal lines cover the whole page, like an old computer monitor. Clicking, typing and dragging still work normally through them.
result: [pending]

### 2. Look at the top-left logo right after a page loads. Then make the window narrower than a laptop screen. Finally, on the Spines page in Detailed view, scroll so a bright spine photo slides under the top bar.
expected: The logo text 'Discogs AI Importer' is purple with a soft glow and ends in an underscore that blinks 5 times, then stays on. In a narrow window only the disc icon shows. The top bar is slightly see-through, the photo shows through it softly blurred, and Upload, Spines and Settings stay easy to read. (Optional: if you turn on 'reduce motion' in your computer's settings, the underscore does not blink at all.)
result: [pending]

### 3. Open the Upload page in a wide window, then narrow it to phone width and widen it again. Drag a photo onto the drop area.
expected: Above the Upload title is a big block-letter sign reading DISCOGS over AI IMPORTER in glowing purple, with the blocks lined up cleanly. At phone width the sign disappears. The Upload title fades from purple to light blue. The line under it starts with a purple '>'. The panel below is titled '## Photos' with a purple '##'; with no photos it reads '> No photos yet. Photos you drop appear here with their progress.' Dropping a photo works as before.
result: [pending]

### 4. On the Spines page in Compact view, look at the spine cards and move the mouse over a few. If any card has an orphaned (warning) badge, hover that one too. Then click Edit spine on one card, hover the opened card, and click Show less.
expected: Each card is slightly darker at the bottom than the top, and has a big faint purple number in its bottom-right corner that matches the spine's number. Under the mouse a card gets a purple edge and a soft glow. An orphaned card keeps its warning-colored edge even under the mouse. The opened card has a purple edge and glow all the time, a much bigger faint number, and a brighter edge and stronger glow under the mouse. Show less returns to the small card.
result: [pending]

### 5. Switch the Spines page to Detailed view. Look at the page title, the line under it, each photo's heading and the cards, and move the mouse over a few cards.
expected: The Spines title fades from purple to light blue, and the line under it starts with a purple '>'. Each photo's heading reads '## ' followed by the file name, with no number in its corner. Every card has the same top-to-bottom fade and a very big faint number in its bottom-right corner. Only the card under the mouse glows, so the long list does not glow all at once.
result: [pending]

### 6. Open Settings. Look at each card and its corner, and read the explanations. Hover the underlined purple links in the Discogs card. Then drag to select the title 'Discogs', copy it, and paste it somewhere.
expected: The Settings title fades purple to light blue, and the line under it starts with a purple '>'. Each card has a big faint number in its corner: 1 Claude CLI, 2 Discogs, 3 Data folder, and 4 Developer if that card shows. Card titles read '## Claude CLI', '## Discogs', '## Data folder' (and '## Developer') with a purple '##'. The explanation sentences and small helper text use a different, rounder font where letters are not all the same width; buttons, including any inside a warning box, stay in the typewriter font. Links are light purple and turn bluish lavender under the mouse, staying underlined. The pasted text is just 'Discogs', without the '##'.
result: [pending]

### 7. On the Spines page, look at the row of status tabs (All is selected when the page opens). Move the mouse over other tabs. If a spine has failed, look at the Failed tab, then click it. Also hover and click Needs review and Fallback if they show.
expected: On the selected tab the number is bright off-white and easy to read, not faded grey. Hovering a tab brightens its number the same way. The Failed number is red when the tab is not selected and turns off-white once you hover or select it. Filtering works as before.
result: [pending]

### 8. On the Spines page, tick a couple of cards so the bottom bar appears and hover its Import button. Then open each warning window without confirming: Dismiss on a card (then Keep spine), Disconnect Discogs in Settings (then Stay connected), and Clear value next to a saved Discogs key (then Keep value). Hover the red button in each.
expected: The bottom bar and every warning window have a purple edge with a soft glow and a subtle top-to-bottom fade, with no corner number. In each window the explanation text uses the rounder font, while the title and buttons stay in the typewriter font. The Import button is light purple with dark text and turns bluish lavender under the mouse. The confirm button in each window is solid pink-red with dark text and gets slightly deeper red under the mouse; its text is never white, and Clear value is never purple. Nothing is actually dismissed, disconnected or cleared.
result: [pending]

### 9. In Settings, change Preferred country and save, then change it back and save again.
expected: The confirmation pop-up in the bottom-right corner is dark slate with light text and a thin border, never white.
result: [pending]

### 10. Select some text on any page with the mouse, and also select some text you typed into a box (for example the search box on the Spines page or a field in Settings). Then press Tab a few times to move between buttons and fields.
expected: Selected text gets a faint purple highlight and keeps its own color, both on the page and inside a typing box, never a solid purple block. The outline that shows which button or field you are on is purple.
result: [pending]

### 11. Open the published demo site (or a fresh demo build) and visit its first page, Upload, Spines and Settings.
expected: The demo looks the same as the app: dark navy-purple with the faint lines, the typewriter font, the block-letter sign on Upload, gradient titles, '##' headings, cards with faint corner numbers (Settings shows 1, 2 and 3; there is no Developer card in the demo), and no white flash or white page anywhere, including the very first page you land on.
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
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
