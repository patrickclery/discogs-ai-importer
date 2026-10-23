---
phase: "02"
slug: "shelf-scan"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-20"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Spine text in a photo -> Claude CLI | Printed text is untrusted model input (prompt injection) | Image pixels, prompt |
| App process env -> claude child process | Secrets and session variables must not cross | Env vars (credentials) |
| npm registry -> node_modules | Package installs (sharp, heic-decode, react-dropzone, TanStack Query, nuqs, shadcn components) | Third-party code |
| Owner photos -> git | Private photos must stay out of the repository | Personal images |
| Spike harness -> subscription quota | Each live call spends quota | Paid calls |
| Browser (any site) -> POST /api/photos | Untrusted bytes, headers, file names | Upload bodies |
| Upload -> durable job queue | A queued run is a future paid call | Job rows |
| HTTP path -> GET /api/files | Untrusted path segments map to files under DATA_DIR | Local files |
| Worker crash/restart -> claude child process | Recovery must not become a second paid call | Run state |
| CLI stderr / AI-read text / file names -> rendered HTML | Untrusted text displayed in the page | Display strings |
| Browser -> PATCH/POST spine and rescan routes | Untrusted JSON edits and state changes | Owner catalogue data |
| URL query parameters -> GET /api/spines | review and photo values from the address bar | Filter params |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Elevation of privilege | vision run argv | high | mitigate | src/server/claude/cli.ts:322-333 `--no-session-persistence --strict-mcp-config --restricted --safe-mode`, `--tools Read --allowedTools Read`, scoped `--add-dir` | closed |
| T-02-02 | Information disclosure | buildClaudeEnv | high | mitigate | src/server/claude/cli.ts:59-70 strips API_BILLING_ENV and SECRET_ENV_NAMES, keeps CLAUDE_CODE_OAUTH_TOKEN | closed |
| T-02-03 | Information disclosure | fixtures/spike/, fixtures/spike/out/ | medium | mitigate | .gitignore:52 `fixtures/spike/` (git check-ignore confirms both) | closed |
| T-02-04 | DoS (quota) | scripts/spike/vision.spike.ts | medium | mitigate | SPIKE_MAX_CALLS (default 24) and SPIKE_FORCE gate, lines 14-83 | closed |
| T-02-05 | Tampering | POST /api/photos body | medium | mitigate | src/app/api/photos/route.ts:73 detectImageKind magic bytes, 415 otherwise | closed |
| T-02-06 | Information disclosure | GET /api/files/[...path] | high | mitigate | route.ts:11-72 root allowlist (crops/thumbs/vision), .webp/.jpg allowlist, resolveData guard, isFile, 404, nosniff | closed |
| T-02-07 | Spoofing | POST /api/photos cross-site | medium | mitigate | src/proxy.ts Origin + sec-fetch-site guard; photos/route.ts:19-47 image/octet-stream only, 415 | closed |
| T-02-08 | Tampering | x-filename header | medium | mitigate | photos/route.ts:86 filename sanitised as display text; content-addressed storage | closed |
| T-02-09 | DoS | upload body | medium | mitigate | photos/route.ts:53-59 411/413 before read; next.config.ts:9 proxyClientMaxBodySize 64mb | closed |
| T-02-10 | Repudiation / cost | duplicate paid calls | high | mitigate | scan-photo.ts:408 isCurrent() before spawn; status ledger; maxAttempts: 1 (ingest.ts:131) | closed |
| T-02-11 | DoS (quota) | reconcile / recovery | high | mitigate | reconcile.ts:66-91 only reparse jobs with maxAttempts: 1; reparse reads raw.json only | closed |
| T-02-12 | Information disclosure | vision/reasons.ts fallback | medium | mitigate | reasons.ts:17-67 paths stripped, cut to 160 chars | closed |
| T-02-13 | Repudiation | raw output persistence | medium | mitigate | scan-photo.ts:286 raw.json written per run before parsing | closed |
| T-02-14 | DoS | upload validation | low | mitigate | photos/route.ts 411/413/400; covered by route.test.ts | closed |
| T-02-15 | Tampering (XSS) | photo-status-row.tsx | medium | mitigate | React text children only; no `dangerouslySetInnerHTML` anywhere in src/ | closed |
| T-02-16 | DoS | client upload loop | low | accept | See Accepted Risks AR-02-01 | closed |
| T-02-17 | Spoofing | uploads from the page | low | mitigate | Same-origin fetch; src/proxy.ts:33 ALLOWED_FETCH_SITES | closed |
| T-02-18 | Tampering | PATCH /api/spines/{id}/fields | medium | mitigate | fields/route.ts:10-18 JSON-only 415, z.enum(SPINE_FIELDS), 500-char cap | closed |
| T-02-19 | Tampering | ai_value integrity | medium | mitigate | src/server/scan/fields.ts:8,72 never assigns ai_value | closed |
| T-02-20 | Tampering (XSS) | spine-card.tsx, spine-crop.tsx | medium | mitigate | React text/attributes only; no raw HTML rendering in src/ | closed |
| T-02-21 | Information disclosure | GET /api/spines | low | accept | See Accepted Risks AR-02-02 | closed |
| T-02-22 | DoS (quota) | src/server/scan/rescan.ts | high | mitigate | rescan.ts:27-76 immediate transaction, run_no dedupe key, maxAttempts: 1 | closed |
| T-02-23 | Spoofing (CSRF) | rescan route | medium | mitigate | JSON-only 415 in rescan/route.ts + proxy guard | closed |
| T-02-24 | Tampering | src/server/scan/merge.ts | high | mitigate | merge.ts:72-150 edited values kept, edited unmatched spines orphaned not deleted | closed |
| T-02-25 | Tampering | orphans.ts reattachSpine | medium | mitigate | orphans.ts:53-123 orphaned source + same-photo candidate check in immediate transaction, 409 | closed |
| T-02-26 | Spoofing (CSRF) | reattach and dismiss routes | medium | mitigate | JSON-only 415 in both routes + proxy guard | closed |
| T-02-27 | Repudiation / data loss | dismissSpine | low | mitigate | orphans.ts:133-142 state-only update; spine_fields kept | closed |
| T-02-28 | Tampering | ?review, ?photo params | low | mitigate | spines-filter-bar.tsx:20 `raw === '1'`; photo bound param; spines-view.tsx:92 "Photo not found" | closed |
| T-02-29 | DoS | photosRefetchInterval error branch | low | accept | See Accepted Risks AR-02-03 | closed |
| T-02-30 | Tampering | SpineField blur/Escape commit | medium | mitigate | src/lib/field-commit.ts:42-58 escape()/flush(); src/lib/field-commit.test.ts | closed |
| T-02-SC | Tampering | package installs | high | mitigate | Exact pins in package.json (sharp 0.35.5, heic-decode 2.1.0, react-dropzone 20.1.3, @tanstack/react-query 5.104.2, nuqs 2.10.1); pnpm-lock.yaml committed | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-16 | Single local user; client upload concurrency capped at 2 (upload-view.tsx:80) and server caps size at 64 MB | Plan 02-07 threat model | 2026-10-20 |
| AR-02-02 | T-02-21 | Loopback-only single-user app; data is the owner's own catalogue and holds no secrets | Plan 02-08 threat model | 2026-10-20 |
| AR-02-03 | T-02-29 | Self-inflicted load only (one GET every 3 s against the local app while unreachable); TanStack skips interval fetches while hidden | Plan 02-13 threat model | 2026-10-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-20 | 31 | 31 | 0 | gsd-secure-phase (L1 grep verification, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-20
