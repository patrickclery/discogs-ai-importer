---
phase: "03"
slug: "discogs-match"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| discogs.com redirect -> GET /api/discogs/callback | Any page can navigate the owner's browser here with chosen query values | OAuth token and verifier |
| Browser -> POST /api/discogs/* and /api/spines/{id}/* | Cross-site attempts, untrusted bodies, pasted codes and links | Request bodies (low sensitivity) |
| App server -> api.discogs.com | Signed requests carry the consumer secret and token secret | OAuth secrets (high) |
| api.discogs.com responses -> app DB | Untrusted bodies, sometimes plain text, stored and later rendered | Release metadata (untrusted) |
| Stored thumb URL (from Discogs) -> outbound fetch | A third-party URL drives a server-side request | URLs, image bytes (untrusted) |
| Spine fields -> Discogs query and raw SQL | Free text crosses into SQL and outbound requests | Artist, title, catalog number |
| Server render -> /settings HTML and RSC payload | Anything rendered reaches the browser | Connection DTO (no secrets) |
| Durable queue -> Discogs rate budget | Retry loops or backfills could get the owner throttled | Request volume |
| Owner's data folder -> report script output | Live data printed to the terminal | Counts and settings only |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Spoofing | callback route | high | mitigate | Pending map, single use, 15 min TTL (auth.ts:20, 97-106) | closed |
| T-03-02 | Tampering | POST /api/discogs/connect | medium | mitigate | Proxy Origin/sec-fetch-site guard; strict empty body; 415 | closed |
| T-03-03 | Information disclosure | settings page, routes, RSC | high | mitigate | getDiscogsConnection() DTO only; canary sweep step (i) | closed |
| T-03-04 | Information disclosure | client.ts errors/logs | high | mitigate | Errors carry status/method/path only; client.test.ts canaries | closed |
| T-03-05 | Spoofing | callback redirect | medium | mitigate | Fixed 303 to /settings?discogs=<enum> | closed |
| T-03-06 | Denial of service | every Discogs request | high | mitigate | globalThis pacing gate, header-derived interval, 429 pause, UA | closed |
| T-03-07 | Tampering | OAuth response parsing | medium | mitigate | URLSearchParams / guarded JSON.parse; identity via zod | closed |
| T-03-08 | Tampering | DISCOGS_*_BASE overrides | low | accept | https or loopback http only (config.ts:25-28) | closed |
| T-03-09 | Tampering | writes to Discogs account | high | mitigate | Method allowlist: GET + POST /oauth/access_token (client.ts:101-103) | closed |
| T-03-10 | Tampering | POST test / disconnect | medium | mitigate | Proxy guard + 415; route tests | closed |
| T-03-11 | Information disclosure | test route responses | medium | mitigate | 160-char reason only; canary test | closed |
| T-03-12 | Tampering | username link | low | mitigate | encodeURIComponent(username) | closed |
| T-03-13 | Elevation of privilege | stale tokens after key cleared | low | mitigate | clearSecretAction calls clearDiscogsAuth | closed |
| T-03-14 | Information disclosure | settings page props | high | mitigate | DiscogsCard gets username and booleans only | closed |
| T-03-15 | Tampering | search.ts parsing | medium | mitigate | zod per result, string caps, malformed results dropped | closed |
| T-03-16 | Denial of service | 429 handling | high | mitigate | JobDeferredError + deferJob, lane gate, Retry-After clamp 1-300 s | closed |
| T-03-17 | Denial of service | revoked sign-in mid-backlog | medium | mitigate | 401 marks auth invalid; searches short-circuit to auth_failed | closed |
| T-03-18 | Tampering | raw SQL in store.ts / enqueue.ts | medium | mitigate | @named parameters only | closed |
| T-03-19 | Information disclosure | spine text sent to Discogs | low | accept | Only artist/title/catno leave the machine; no images | closed |
| T-03-20 | Tampering | duplicate searches | low | mitigate | IMMEDIATE transactions + UNIQUE dedupe_key | closed |
| T-03-21 | Tampering | CandidateRow, DiscogsMatches | medium | mitigate | React text only, no dangerouslySetInnerHTML | closed |
| T-03-22 | Tampering | external release link | low | mitigate | href from integer releaseId; rel noreferrer | closed |
| T-03-23 | Denial of service | /api/spines payload | low | mitigate | INLINE_CANDIDATES = 3; rest loaded lazily | closed |
| T-03-24 | Information disclosure (SSRF) | thumbs.ts | high | mitigate | Host must equal imageBase(); redirect 'error'; URL from DB only | closed |
| T-03-25 | Tampering | image bytes | medium | mitigate | 2 MB cap, image/*, sharp WebP re-encode, nosniff | closed |
| T-03-26 | Denial of service | cover downloads | low | mitigate | One in-flight per URL, max 4, 10 s timeout | closed |
| T-03-27 | Tampering (path traversal) | /api/files discogs-thumbs | medium | mitigate | safeSegment + resolveData containment; ../app.db test | closed |
| T-03-28 | Information disclosure | /api/status discogs part | low | accept | Counts, pausedUntil, connected flag only | closed |
| T-03-29 | Tampering | POST /api/spines/{id}/search | medium | mitigate | Proxy guard, 415, strict body schema | closed |
| T-03-30 | Denial of service | repeated Search again / Retry | low | mitigate | 409 busy while search queued/running | closed |
| T-03-31 | Tampering | POST /api/spines/{id}/candidates | medium | mitigate | { searchId, releaseId } only; copies from spine's own done search | closed |
| T-03-32 | Spoofing (integrity) | pasted numbers and links | medium | mitigate | Master links refused client+server; explicit pick required | closed |
| T-03-33 | Tampering | dialog input parsing | low | mitigate | 500-char cap, new URL in try, discogs host allowlist | closed |
| T-03-34 | Information disclosure (SSRF) | dialog result covers | medium | mitigate | URL from results_json via ensureThumb allowlist | closed |
| T-03-35 | Tampering | search text/ref modes | medium | mitigate | Proxy guard, 415, strict discriminated union, paced lane | closed |
| T-03-36 | Information disclosure | report-discogs-live.ts | medium | mitigate | readonly DB; counts and two settings only; no secrets.json | closed |
| T-03-37 | Denial of service | real-account backfill | low | accept | Paced gate ~54/min with project UA; 429 pauses | closed |
| T-03-38 | Tampering | POST /api/discogs/finish | medium | mitigate | Proxy guard, 415, 200-char cap, pending deleted after 5 rejects | closed |
| T-03-39 | Tampering | callback URL from Host | low | mitigate | Host limited to loopback by proxy.ts; rendered as text | closed |
| T-03-40 | Denial of service | connect backfill | low | mitigate | Idempotent enqueue; skips auth_failed and failed spines | closed |
| T-03-41 | Tampering | GET /api/spines/{id}/candidates | low | mitigate | Named param; 404 for unknown/superseded/dismissed | closed |
| T-03-42 | Tampering | candidates POST refusals | medium | mitigate | Route tests: 404 foreign/automatic/unknown, 409, 415 | closed |
| T-03-SC | Tampering | npm installs / shadcn add | high | mitigate | package.json and lockfile unchanged in phase 3; collapsible uses installed radix-ui | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Residual notes (non-blocking, tracked in 03-REVIEW.md)

- **T-03-16 / WR-02:** a route-triggered 429 while a search job runs can make the job time out in `gate.acquire` and spend one attempt. No extra Discogs requests are sent.
- **T-03-13 / WR-03:** saving a new consumer key keeps the old OAuth token (clearing the key does disconnect). Outside the declared mitigation.
- **T-03-38 / IN-04:** 401s unrelated to the code also count toward the 5-try limit. Stricter than intended, not a bypass.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-08 | DISCOGS_*_BASE overrides are owner-controlled env only, limited to https or loopback http, test-only | Plan 03-01 | 2026-10-21 |
| AR-03-02 | T-03-19 | Sending artist, title and catalog number to Discogs is the feature; no photo or crop leaves the machine | Plan 03-03 | 2026-10-21 |
| AR-03-03 | T-03-28 | /api/status exposes counts, a timestamp and a connected flag only; local single-user app | Plan 03-06 | 2026-10-21 |
| AR-03-04 | T-03-37 | Real-account backfill runs through the paced gate (~54/min) with the project User-Agent; 429 pauses and resumes | Plan 03-13 | 2026-10-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 43 | 43 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21
