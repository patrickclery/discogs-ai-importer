---
phase: "4"
slug: "import-review-queue"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-22"
---

# Phase 4 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → app routes | Mutating JSON routes (confirm, cancel, retry, retry-failed, link-existing, another, not-on-discogs, folders) behind the proxy Origin / sec-fetch-site guard | spine ids, candidate choice, flags (no release ids trusted) |
| App → api.discogs.com | First phase that writes to the owner's account; one paced gate | OAuth token (PLAINTEXT), username in path, add-to-folder POST |
| App → SQLite / data folder | imports table, intent rows, instance ids | collection state, folder ids |
| Live report script → real DB | Read-only report of real imports | counts/ids only, no username or secrets |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|----------|-------------|-----------------------|--------|
| T-04-01 | Tampering | confirm route | high | mitigate | proxy.ts:38-50; import/route.ts:18-22,35-41; store.ts:239-247 | closed |
| T-04-02 | Tampering | confirm route / store | high | mitigate | strictObject; release_id taken from stored candidate (store.ts:239-247,264) | closed |
| T-04-03 | EoP | Discogs write gate | high | mitigate | client.ts:30-31 regex, 121-129, 207-209; client.test.ts:444-596 | closed |
| T-04-04 | Info disclosure | client errors | medium | mitigate | client.ts:131-134,205; canary tests client.test.ts:622-659 | closed |
| T-04-05 | Tampering | createImport | high | mitigate | IMMEDIATE tx store.ts:200-279; drizzle/0003 imports_spine_open_idx; dedupe key store.ts:301 | closed |
| T-04-06 | Tampering | add_to_collection | high | mitigate | adopt add-to-collection.ts:243-264; fenced intent before POST 285-306 | closed |
| T-04-07 | Tampering | collection parsing | medium | mitigate | collection.ts:19,31,110-111; drizzle/0003:27 | closed |
| T-04-08 | Tampering | collection paths | medium | mitigate | collection.ts:50-77; client.ts:180; allowlist client.ts:30 | closed |
| T-04-09 | Tampering | 502 after commit | high | mitigate | as T-04-06; verify-discogs-import.ts:569-577 | closed |
| T-04-10 | Tampering | reconcile adopt rule | medium | mitigate | collection.ts:100-115 (snapshot, recorded, 120 s skew); hold 267-281 | closed |
| T-04-11 | DoS | stuck "Importing" | medium | mitigate | recovery.ts:20-34; handlers/index.ts:50 | closed |
| T-04-12 | Info disclosure | stored error text | medium | mitigate | slice(160) add-to-collection.ts:133,146; client.ts:262 | closed |
| T-04-13 | EoP | stale job POST | medium | mitigate | isCurrent before POST add-to-collection.ts:311; 151-154; 285-292 | closed |
| T-04-14 | Tampering | Change match | high | mitigate | store.ts:369-393; queue.ts:272 | closed |
| T-04-15 | Tampering | Retry import | high | mitigate | store.ts:410-423 same row; retry_first 221-238 | closed |
| T-04-16 | Tampering | cancel/retry routes | medium | mitigate | import/route.ts:28,149-155; retry/route.ts:15,26-39 | closed |
| T-04-17 | Tampering | candidate rendering | medium | mitigate | no dangerouslySetInnerHTML; candidate-row.tsx:16-17,119 | closed |
| T-04-18 | DoS | repeated confirms | low | mitigate | dedupe store.ts:301-316; gate client.ts:232 | closed |
| T-04-19 | Tampering | ?status= param | low | mitigate | review-status.ts:56-63; scan/queries.ts:357-361 | closed |
| T-04-20 | DoS | /api/spines payload | low | mitigate | scan/queries.ts:330-349; INLINE_CANDIDATES=3 | closed |
| T-04-21 | Info disclosure | connection flags in payload | low | accept | discogs/queries.ts:414-431 returns flags only | closed (accepted) |
| T-04-22 | Tampering | folder id | high | mitigate | folders.ts:102-109, 48-54; settings/actions.ts:142-161; client.ts:31 folder [1-9] | closed |
| T-04-23 | Tampering | folder names | medium | mitigate | folders.ts:25 max(200); text-only render | closed |
| T-04-24 | DoS | folder refresh | low | mitigate | folders/route.ts:89-91; gate; 1 h TTL | closed |
| T-04-25 | Info disclosure | folder errors | medium | mitigate | folders/route.ts:29-38 | closed |
| T-04-26 | Tampering | folder routes | low | mitigate | folders/route.ts:60-82; proxy; server action | closed |
| T-04-27 | Tampering | re-scan merge | high | mitigate | merge.ts:165-174 keepSpine; orphans.ts:33-35 | closed |
| T-04-28 | Repudiation | dismiss imported spine | medium | mitigate | orphans.ts:138-165; dismiss-spine-button.tsx:76,109 | closed |
| T-04-29 | DoS | auto-search of finished spines | low | mitigate | enqueue.ts:30-32,109,170,212 | closed |
| T-04-30 | Tampering | link-existing | medium | mitigate | store.ts:535-572; drizzle/0003:27 | closed |
| T-04-31 | Tampering | duplicate add | high | mitigate | store.ts:248-251; add-to-collection.ts:268; another/route.ts:14,25-38 | closed |
| T-04-32 | Info disclosure | other spine's crop in 409 | low | accept | crop URL is /api/files only (scan/queries.ts:63-65) | closed (accepted) |
| T-04-33 | Tampering | duplicate dialog | medium | mitigate | duplicate-import-dialog.tsx:32-34,89,124 | closed |
| T-04-34 | Tampering | not-on-Discogs mark | medium | mitigate | not-on-discogs.ts:46-70; store.ts:210 | closed |
| T-04-35 | Tampering | mark route | low | mitigate | not-on-discogs/route.ts:12,23-36 | closed |
| T-04-36 | Repudiation | mark/unmark | low | mitigate | not-on-discogs-line.tsx:32-42; spine-action-menu.tsx:123,160 | closed |
| T-04-37 | Tampering | retry-all never adds unconfirmed | high | mitigate | retry-failed/route.ts:53-58 → store.ts:453-494 | closed |
| T-04-38 | DoS | retry-all flood | low | mitigate | dedupe store.ts:301; discogs lane gate | closed |
| T-04-39 | Info disclosure | header/live report | medium | mitigate | discogs/status.ts counts only; report-discogs-import-live.ts:22,51-54 | closed |
| T-04-40 | Tampering | retry-failed route | low | mitigate | retry-failed/route.ts:20-43 | closed |
| T-04-41 | Info disclosure | import read model | medium | mitigate | imports/queries.ts:130-143 | closed |
| T-04-42 | Tampering | read-model mapping | low | mitigate | imports/queries.ts:53-121; tests 405,483 | closed |
| T-04-43 | EoP | gate regression | high | mitigate | client.test.ts:444-596 in `vitest run` | closed |
| T-04-44 | Info disclosure | test secrets | low | mitigate | canary values + mkdtemp SECRETS_FILE; stub fetch | closed |
| T-04-45 | Tampering | toasts | low | mitigate | spines-view.tsx:457 string body | closed |
| T-04-SC | Tampering | supply chain | high | mitigate | no package.json/pnpm-lock/components.json change; registries {} | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-21 | /api/spines exposes only Discogs connected/needs-reconnect flags to the local browser; no token or username. Local single-user app bound to 127.0.0.1. | Plan 04-05 register (auto) | 2026-10-22 |
| AR-04-02 | T-04-32 | The 409 duplicate reply includes the other spine's crop URL, served only through the allowlisted /api/files route of the owner's own data folder. | Plan 04-04 register (auto) | 2026-10-22 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-22 | 46 | 46 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-22
