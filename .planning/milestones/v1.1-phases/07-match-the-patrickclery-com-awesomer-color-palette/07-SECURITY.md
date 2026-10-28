---
phase: "07"
slug: "match-the-patrickclery-com-awesomer-color-palette"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-26"
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser storage → theme | Stored `localStorage.theme` read by next-themes | Untrusted string, ignored (forced dark) |
| Build → fonts | next/font fetches Google fonts at build time and self-hosts them; local woff2 ships in repo | Font binaries |
| Demo export | Static build checked by verify-export | Public HTML |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-07-01 | Tampering | demo export (verify-export.ts) | low | mitigate | Rule i fails build when a layout page lacks the dark class (verify-export.ts:110) | closed |
| T-07-02 | Tampering | stored localStorage.theme | low | mitigate | theme-provider.tsx:11 `forcedTheme="dark"` | closed |
| T-07-03 | Info Disclosure | verify-export messages | low | accept | Fixed string + relative path only | closed |
| T-07-04 | Spoofing | Clear value confirm (secret-field.tsx) | low | mitigate | secret-field.tsx:245 `variant="destructive"` | closed |
| T-07-05 | Tampering | button and badge variants | low | accept | Class edits only | closed |
| T-07-06 | Tampering | ?status= parameter | low | accept | Whitelist unchanged | closed |
| T-07-07 | Spoofing | inline link hrefs | low | accept | Only hover classes change | closed |
| T-07-08 | Tampering | ascii_mono.woff2 | low | mitigate | globals-css.test.ts:260-264 pins size and sha256; OFL ships beside it | closed |
| T-07-09 | Info Disclosure | font loading | low | mitigate | next/font self-hosts (fonts.ts:1-2); no third-party font host in src/app | closed |
| T-07-10 | DoS | body::before scanline overlay | low | mitigate | globals.css:120 `pointer-events: none` (asserted by test) | closed |
| T-07-11 | Spoofing | dialog surfaces | low | accept | Destructive confirm fill/copy unchanged | closed |
| T-07-12 | Spoofing | app-header logo link | low | accept | href and aria-label asserted in app-header.test.ts | closed |
| T-07-13 | Repudiation | destructive Alert / menu focus | low | mitigate | AA contrast tokens C-5/C-6, tested in mocha-variants.test.ts | closed |
| T-07-14 | Spoofing | discogs-card outbound links | low | accept | hrefs, target, rel untouched | closed |
| T-07-15 | Info Disclosure | settings/page.demo.tsx | low | accept | Masked tails only; verify-export rule h | closed |
| T-07-SC | Tampering | package installs | low | accept | No packages installed (next/font ships with Next) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-03, 05, 06, 07, 11, 12, 14, 15, SC | Styling-only changes; behaviour, hrefs and secrets handling untouched | plan-time threat model | 2026-10-26 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-26 | 16 | 16 | 0 | orchestrator L1 grep (ASVS 1 short-circuit, all low severity) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-26
