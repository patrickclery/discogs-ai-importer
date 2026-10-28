---
created: 2026-10-28T17:54:54.695Z
title: Add GitHub repo link icon to top bar
area: ui
severity: cosmetic
files:
  - src/components/app-header.tsx
audit_acknowledged:
  milestone: v1.1
  at: 2026-10-28
---

## Problem

People using the app (or the published demo site) have no way to find the project's source code. The owner wants a visible GitHub icon in the UI that links to the repo.

## Solution

Add a GitHub icon link to the top bar (`src/components/app-header.tsx`, at the right end near the status dot) pointing to https://github.com/patrickclery/discogs-ai-importer. Open it in a new tab with `rel="noopener noreferrer"` and an accessible label such as "View source on GitHub". Note that lucide-react's brand icons may be deprecated or removed, so use a small inline SVG if needed. Keep it in the phase 7 awesomer styling: muted by default, purple on hover, and the purple focus outline. It should show in both the app and the demo build.
