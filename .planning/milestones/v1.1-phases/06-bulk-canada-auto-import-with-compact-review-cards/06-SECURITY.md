---
phase: "06"
slug: "bulk-canada-auto-import-with-compact-review-cards"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-26"
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → app routes | Bulk-import, retry and settings POSTs from the local UI | Spine/candidate ids, country strings (untrusted input) |
| App → Discogs API | Master versions lookups and add-to-collection through the rate-limited gate | OAuth-signed requests; Discogs JSON answers (untrusted) |
| Demo site | Static export, all bulk state in page memory | Canned fixtures only, no network |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Tampering | choosePressing / parseVersions | high | mitigate | versions.ts:91 items cap; pressing.ts:219-220 country re-check, :257 title guard | closed |
| T-06-02 | DoS | VersionSchema | medium | mitigate | versions.ts:48,53-63 cap(), major_formats ≤10, bad entries dropped | closed |
| T-06-03 | Tampering | BULK_START_BODY | high | mitigate | bulk-types.ts:159-168 strictObject, ids 1..40, ≤2000 items | closed |
| T-06-04 | Tampering | resolve-pressing choice | high | mitigate | resolve-pressing.ts:211-219, :391-394 release only from candidate/guarded version | closed |
| T-06-05 | Tampering | createImport call | high | mitigate | resolve-pressing.ts:411-416 no allowDuplicate; add-to-collection.ts:30-34 held check | closed |
| T-06-06 | DoS | Discogs lane | medium | mitigate | bulk/store.ts:160 dedupe; 0004 spine_open_idx; client.ts:232 gate; 429 defers | closed |
| T-06-07 | Info Disclosure | bulk_items.error | low | mitigate | bulk/store.ts:23,244,266 160-char cap; client.ts:205 redaction | closed |
| T-06-08 | Tampering | migrations 0004/0005 | medium | mitigate | Additive only; migrations.test.ts:91 on a Phase 5 DB copy | closed |
| T-06-09 | Tampering | preferred country setting | medium | mitigate | settings.ts:125 zod trim/min1/max40; encoded searchParams | closed |
| T-06-10 | Spoofing | server action POST | low | mitigate | proxy.ts:42-50 Origin guard | closed |
| T-06-11 | Info Disclosure | BulkItemDto.failure | low | mitigate | bulk/queries.ts:92-104 kind only + 160-char reason | closed |
| T-06-12 | Tampering | parseFallbackParam | low | mitigate | scan/queries.ts:306-307 exact '1' | closed |
| T-06-13 | Tampering | retrySpine / retryBulkItem | high | mitigate | imports/store.ts:562; bulk/store.ts:308-320; add only via createImport/retryImport | closed |
| T-06-14 | DoS | stuck lookups | medium | mitigate | bulk/recovery.ts:24-40; bulk-eligibility.ts:29-32 | closed |
| T-06-15 | Spoofing / EoP | bulk-import route | high | mitigate | proxy.ts:42-47; route.ts:36-41 415; loopback bind | closed |
| T-06-16 | DoS | bulk-import route | medium | mitigate | ≤2000 items; route.ts:91,117 409 one run; no Discogs call in route | closed |
| T-06-17 | Tampering | picks | high | mitigate | bulk/picks.ts:54-60 eligibility re-check; tx.immediate | closed |
| T-06-18 | Info Disclosure | demo route | medium | mitigate | demo/routes/bulk.ts:17-23 in memory; routes-coverage.test.ts:308 | closed |
| T-06-19 | XSS | TopMatchRow / CompactSpineCard | medium | mitigate | No dangerouslySetInnerHTML in src/; asset-urls.ts:7-12 | closed |
| T-06-20 | XSS | CountryBadge / BulkStatusLine | medium | mitigate | bulk-copy.ts fixed '/settings'; text nodes | closed |
| T-06-21 | Spoofing | Retry import POST | low | mitigate | Same-origin JSON POST; retry route 415; server state re-check | closed |
| T-06-22 | Tampering | BulkImportDialog | medium | mitigate | Confirm names count/folder/country before ids-only fetch | closed |
| T-06-23 | XSS | bar, dialog, toasts | low | mitigate | Plain strings / React text | closed |
| T-06-24 | Info Disclosure | verify-bulk-import.ts | high | mitigate | import-flow.ts:109-127 temp dir; canary keys; temp SECRETS_FILE | closed |
| T-06-25 | Info Disclosure | demo bulk ops | medium | mitigate | Fixture-only outcomes; fetch spy test | closed |
| T-06-26 | Tampering | fallback URL param | low | mitigate | Exact '1' on server and client | closed |
| T-06-27 | Tampering | fallback tier | medium | mitigate | Shared rankTier, parseVersions, title guard | closed |
| T-06-28 | Tampering | fallback country setting | medium | mitigate | settings.ts:166 same zod schema | closed |
| T-06-29 | Spoofing | server action POST | low | mitigate | proxy.ts:42-50 | closed |
| T-06-30 | Tampering | ?status= parameter | low | accept | review-status.ts:73-80 whitelist unchanged | closed |
| T-06-31 | Tampering | versionsQuery(fallback_country) | medium | mitigate | Run snapshot of validated setting; encoded query | closed |
| T-06-32 | DoS | Discogs rate limit | medium | mitigate | Second GET only when needsFallbackLookup; shared gate; 429 defers | closed |
| T-06-33 | Tampering | fallback release id | medium | mitigate | versions.ts:91; pressing.ts:257; no allowDuplicate | closed |
| T-06-34 | Info Disclosure | demo fallback tier | low | mitigate | Fixture-only; fetch spy over fallback run | closed |
| T-06-35 | XSS | fallback/finding/dialog copy | low | mitigate | Plain strings, React text; max(40) | closed |
| T-06-SC | Tampering | package installs | low | accept | No package changes in phase 6 (lockfile last changed 05-02); checkbox is registry source | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-SC | No new npm packages installed during the phase | plan-time threat model | 2026-10-26 |
| AR-06-02 | T-06-30 | Layout-only change; status whitelist unchanged | plan-time threat model | 2026-10-26 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-26 | 36 | 36 | 0 | gsd-security-auditor (ASVS L1; phase 7 XSS recheck clean) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-26
