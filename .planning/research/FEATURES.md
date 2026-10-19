# Feature Research

**Domain:** Personal physical-media cataloguing (shelf/spine photo → AI extraction → Discogs collection import)
**Researched:** 2026-10-18
**Confidence:** MEDIUM. Competitor features come from vendor and store listings and community posts. Discogs API behaviour comes from what is known about the API plus client-library docs; the official docs page could not be fetched (Cloudflare 403).

## Landscape Summary

| Product class | Examples | Input model | Review/correction | Relevance |
|---|---|---|---|---|
| Barcode-first collection apps | Discogs app, CLZ Music/Movies, Delicious Library, My Vinyl+ | One item at a time (barcode, or catno/artist/title search) | Pick from 1–3 versions, edit fields after adding | Sets the bar for *matching* and *version picking* |
| OCR-assisted Discogs clients | SnapVinyl | One item, cover/label OCR or barcode | Minimal | Shows OCR → Discogs search is a known pattern |
| Shelf/spine AI scanners (books) | TitleEntry, BiblioScan, Shelf Scan, FlipLit, Gemini "Book List Generator" | **Many items per photo** (TitleEntry claims up to 300) | Weak or none; output is a list or CSV export | Closest to our pipeline, and the gap we fill |
| Discogs CSV/script tools | discogs-get-collection, discogs-backup, DiscoDOS, Common Ground CSV uploader | Spreadsheet of release IDs | Preview-before-submit with error list (Common Ground) | Batch-import UX: preview, error list, then submit |

**Key insight:** Barcode apps are accurate but slow (one item at a time). Shelf scanners are fast but don't let you check their results: none of them shows the source crop next to the guess. This product is a shelf scanner with a barcode-app-grade confirmation step. Most of the value is in the review queue, not the AI call.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Drag-and-drop multi-photo upload with per-photo processing status (queued / analyzing / done / error) | Every batch tool shows progress. Without it a 30-photo session is a black box | LOW | Process photos in a background queue; poll status (no websockets needed) |
| One vision call per photo returning all spines + bbox + fields | Core pipeline (PROJECT constraint) | MEDIUM | Structured output via tool-use schema. Normalize EXIF rotation *before* the call so bbox coords match the stored image |
| Image-hash dedup; explicit "re-scan" button | Prevents surprise API spend (PROJECT constraint) | LOW | SHA-256 of the normalized bytes; a perceptual hash is optional later |
| Spine crop shown next to extracted fields on every row | Core value. Shelf scanners lack this, and it's how errors get caught | LOW | sharp extract with padding (5–10%); AI bboxes are approximate |
| Crop displayed rotated to horizontal | Spine text is vertical; reading it means tilting your head | LOW | Store rotation hint from the model (text reads top→bottom vs bottom→top) or a manual rotate toggle |
| Editable fields (artist, title, format, catno, label) + "re-search Discogs" | OCR on spines is lossy. Every competitor lets you edit | LOW | Edits stored separately from raw AI output, so both are kept |
| Candidate list with cover thumbnails, year, country, label, catno, format | Discogs app/CLZ show versions to choose from. Thumbnails are how humans confirm | MEDIUM | Thumbs from search results. Cache locally to save requests and keep the app portable |
| Manual free-text Discogs search + paste release URL/ID | The escape hatch when AI text is garbage. CLZ has 3 add paths (barcode, artist/title, catno) | LOW | Parse `discogs.com/release/12345-...` → ID → fetch → confirm |
| Explicit confirm before adding to collection | Fuzzy matches would pollute the collection (PROJECT decision) | LOW | Never auto-add |
| Status per spine: pending / matched / imported / not found / not on Discogs / failed | PROJECT requirement; standard batch-import pattern (Common Ground preview + error list) | LOW | Filter tabs by status; counts per status |
| "Already in your collection" warning | Re-photographing an overlapping shelf is guaranteed; double-adds are the #1 cleanup chore | LOW–MEDIUM | Search results include per-user collection flags when authenticated (MEDIUM confidence). Fallback is `GET /users/{u}/collection/releases/{id}`. Also check locally for the same release_id imported from another photo |
| Throttled Discogs request queue with visible backlog/ETA | 60 req/min limit; a 40-spine photo = 40+ searches | MEDIUM | Single global queue; read `X-Discogs-Ratelimit-Remaining`; back off on 429 |
| Collection folder choice (default Uncategorized) | Discogs app and CLZ both organize by folders/collections | LOW | Folder 1 = Uncategorized. Folder 0 ("All") can't be added to |
| Discogs OAuth 1.0a connect + local key settings | Needed to add to collection | MEDIUM | OAuth 1.0a request-token dance; store tokens locally |
| Retry for failed items (AI parse failure, Discogs 5xx) | Batch jobs fail partially. Users expect retry, not re-upload | LOW | Per-item retry. Photo-level re-scan stays an explicit action |

### Differentiators (Competitive Advantage)

Aligned with the Core Value: photograph once, everything gets in reliably, mistakes are easy to see.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Overlay of detected bboxes on the original photo**; click box ↔ jump to row | Missed or merged spines become obvious at a glance. No competitor shows this | MEDIUM | SVG overlay scaled to the displayed image; colour by status |
| **Manual "add missed spine"**: draw a box on the photo, type text, no AI call | Vision models skip thin or dark spines. Without this the user falls back to manual Discogs entry | MEDIUM | Same crop/search path as AI rows; source=`manual` |
| **Search cascade using catno first** | Catalog numbers on CD spines are very precise identifiers. Cuts version-picking effort sharply | MEDIUM | catno+label → artist+title+format → free-text `q`. Record which strategy hit |
| **Smart candidate ranking** | Discogs returns many versions per album. Barcode apps make the user filter by hand | MEDIUM | Score: catno exact match > format match (CD/DVD) > label match > preferred country > community "have" count |
| **Music vs non-music classification in the same vision call** | Movie DVDs can't be on Discogs. Skipping their searches saves rate-limit budget and review time | LOW | Add `kind: music \| film \| other` to the schema; auto-set "not on Discogs (film)" but keep it overridable. Concert/music DVDs *are* on Discogs |
| **Per-field confidence / "unreadable" flags from the model**; sort the review queue by lowest confidence | The user's attention goes where errors are likely | LOW | Model self-reports; treat as a hint, not truth |
| **Keyboard-driven review** (j/k next/prev, Enter = accept top candidate, e = edit, n = not on Discogs) | Reviewing 300 spines by mouse is painful. This is the real throughput bottleneck | LOW–MEDIUM | Flow: auto-advance to the next pending row after accept |
| **Explicit bulk accept** (select rows → add top candidate) | Speeds up clean photos without making auto-add the default | LOW | Only for rows where a candidate is explicitly selected or catno matched exactly |
| **"Accept with unverified version" + note** | Exact pressing (matrix codes) is the biggest Discogs pain point. Let the user add the most likely version and flag it | LOW | Write the flag into the Discogs instance Notes field, or a local flag |
| **Shelf location auto-tag** (photo name/label → Discogs custom field or notes) | Physical findability ("Shelf 3, row 2"). CLZ has a Location field | LOW–MEDIUM | Collection custom fields can be edited per instance via the API. Costs one extra request per item |
| **Undo import** | Mistaken confirms happen during fast keyboard review | LOW | Store `instance_id` from the add response; DELETE the instance |
| **Export local catalogue (CSV/JSON), including "not on Discogs" items** | Film DVDs still need a home (CLZ Movies, Letterboxd, a spreadsheet). Keeps the app portable | LOW | TitleEntry and others all have CSV export, so it's cheap and expected for the non-Discogs remainder |
| **Cost/usage display per photo** (tokens, est. $) | Keeps the user aware of spend and validates the one-call-per-photo design | LOW | From the API response `usage` |
| **Adjustable crop** (nudge bbox edges) | AI bboxes drift; a bad crop hides the evidence | MEDIUM | Re-crop locally with sharp; no AI call |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Auto-add high-confidence matches without review | "Save time" | Wrong versions get into the collection, and each costs more to find and fix than it saved | Keyboard review + explicit bulk accept |
| Per-spine AI re-read / second-pass vision call | Better accuracy on hard spines | Explicitly rejected for cost. N-times spend | Manual edit + search cascade. Re-scan the whole photo only on explicit action (maybe a closer photo) |
| Live camera / mobile scanning mode | Barcode apps and FlipLit do it | A different product (native app, real-time CV). Desktop drag-and-drop covers the need | Take photos with the phone, drop them on the desktop |
| Exact pressing verification workflow (matrix/runout codes) | Discogs purists | Needs physical inspection of each disc, which defeats shelf scanning | "Unverified version" flag; fix later in Discogs |
| Marketplace pricing / collection value | Discogs app and FlipLit show value | Out of scope (collection only); more requests eat the rate limit | Discogs website shows value already |
| Local mirror of the Discogs data dump for offline matching | Avoid the rate limit | Dumps are many GB of XML and need an import pipeline, all for a one-off cataloguing job | Throttled queue; cache search results by query |
| Creating new Discogs releases for unmatched items | "Complete" the catalogue | The API doesn't support release submission | "Not on Discogs" status + CSV export |
| Movie database integration (TMDB/IMDb) for film DVDs in v1 | Many items are films | Scope creep into a second catalogue product | Export film items to CSV; consider for v2 |
| 3D shelf / coverflow visuals (Delicious Library-style) | Looks nice | No help with the import job | Plain dense table with crop + thumbnail |
| Wantlist, ratings, tracklist editing, multi-user | Full Discogs-client parity (SnapVinyl, Discogs app) | It's an importer, not a Discogs client | Link out to the Discogs release page |
| Real-time push (websockets/SSE) for job status | Feels modern | Extra infrastructure for a single local user | Short-interval polling |

## Feature Dependencies

```
Settings (API keys) ──> Upload + hash dedup ──> Vision extraction (1 call/photo)
                                                   └──> Local crop (sharp) ──> Review list (crop + fields + status)
                                                                                  ├──> Edit fields ──> Re-search
                                                                                  └──> Bbox overlay ──> Manual "add missed spine"
                                                                                                    └──> Adjustable crop
Discogs OAuth ──> Throttled request queue ──> Search cascade ──> Candidate list + ranking
                                                                    └──> Confirm ──> Add to collection ──> Undo import
                                                                                                    ├──> Folder choice
                                                                                                    └──> Notes / location custom field
Already-in-collection check ──requires──> OAuth + queue + candidate list
Music/film classification ──enhances──> Search cascade (skip film searches)
Per-field confidence ──enhances──> Review list (sort/filter)
Keyboard review ──enhances──> Review list + Confirm
Bulk accept ──conflicts──> "never auto-add" (resolve: bulk accept is always user-initiated on selected rows)
Export CSV ──requires──> local DB only (no Discogs dependency)
```

### Dependency Notes

- **Review list requires crops, which require EXIF-normalized images:** if rotation isn't normalized before the vision call, the bboxes won't match the stored image and every crop will be wrong. Image normalization belongs in the first pipeline phase.
- **Everything Discogs-side requires the throttled queue:** build the queue before search, the collection check and add-to-collection. Bolting it on later means rewriting every call site.
- **Already-in-collection check rides on search results:** if the authenticated search response carries per-user collection flags, it costs no extra requests. Verify during the Discogs phase.
- **Manual missed-spine requires the bbox overlay:** the user needs to see the photo with existing boxes before drawing a new one.
- **Music/film classification has to be in the extraction schema from day one:** adding it later means re-running vision calls, which conflicts with the dedup/cost constraint.

## MVP Definition

### Launch With (v1)

- [ ] Settings for Anthropic key + Discogs app credentials. Needed for anything else to work
- [ ] Drag-and-drop upload, EXIF normalize, hash dedup, explicit re-scan. Cost control
- [ ] One vision call per photo with schema: fields, bbox, `kind` (music/film), per-field confidence, text orientation. Getting the schema right once avoids paid re-runs
- [ ] Local crops, shown rotated horizontal, next to editable fields. Core value
- [ ] Discogs OAuth + throttled queue + search cascade (catno-first) + candidate thumbnails. Matching
- [ ] Manual search / paste release URL. Escape hatch
- [ ] Confirm → add to chosen folder, with an already-in-collection warning. Safe import
- [ ] Status list with filters (pending / matched / imported / not found / not on Discogs / failed) + per-item retry

### Add After Validation (v1.x)

- [ ] Bbox overlay on the original photo + manual "add missed spine". Add once real photos show how often spines are missed (expected: often)
- [ ] Keyboard-driven review + bulk accept. Add once a real shelf session feels slow
- [ ] Smart candidate ranking beyond catno match. Add when version-picking dominates review time
- [ ] Undo import. Add after the first mistaken confirm
- [ ] CSV/JSON export, including "not on Discogs" items. Add once film DVDs pile up
- [ ] Adjustable crop. Add if bbox drift hides spine text

### Future Consideration (v2+)

- [ ] Shelf location → Discogs custom field. Extra request per item; nice but not core
- [ ] Cost/usage dashboard. Low value once spend is known to be small
- [ ] Film catalogue integration (TMDB/CLZ Movies export format). Separate product scope

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Upload + dedup + 1-call extraction + crops | HIGH | MEDIUM | P1 |
| Crop-next-to-fields review list + edit/re-search | HIGH | LOW | P1 |
| OAuth + throttled queue + catno-first search + candidates | HIGH | MEDIUM | P1 |
| Confirm/add + already-in-collection warning | HIGH | LOW | P1 |
| Music/film classification in schema | MEDIUM | LOW | P1 (schema-level, cheap now, expensive later) |
| Manual search / paste URL | HIGH | LOW | P1 |
| Bbox overlay + add missed spine | HIGH | MEDIUM | P2 |
| Keyboard review + bulk accept | HIGH | LOW | P2 |
| Candidate ranking | MEDIUM | MEDIUM | P2 |
| Undo import | MEDIUM | LOW | P2 |
| Export CSV | MEDIUM | LOW | P2 |
| Adjustable crop | MEDIUM | MEDIUM | P3 |
| Location custom field | LOW | LOW | P3 |
| Cost display | LOW | LOW | P3 |

## Competitor Feature Analysis

| Feature | Discogs app | CLZ Music | Shelf scanners (TitleEntry etc.) | Our Approach |
|---|---|---|---|---|
| Input | Barcode scan, search | Barcode (claims 95% hit rate), artist/title, catno | One photo → many items | One photo → many spines + manual fallbacks |
| Version picking | Shows 1–3 releases per barcode; filters by format/year/country | Picks from Core/Discogs DB | N/A (books ≈ one edition) | Catno-first cascade + ranked thumbnails |
| Evidence shown during review | Cover art of candidate | Cover art | Rarely any source crop | **Spine crop + candidate cover side by side** |
| Correction | Re-search | Edit all fields after add | Little or none | Edit fields → re-search before add |
| Duplicates | Allows multiple copies; shows in-collection indicator | Duplicate handling in app | None | Warn on in-collection + local cross-photo dedup |
| Organization | Folders | Collections, location, condition, notes | CSV export | Folder choice; notes/location later |
| Unmatched items | Manual search | Manual add | N/A | "Not on Discogs" status + export |

## Sources

- CLZ Music store listing and manual (barcode, artist/title and catno add paths; Core/Discogs data; editable fields; location): https://apps.apple.com/app/id317997093 , https://clz.com/music/mobile/manual/ios/2.0/en/topic/adding-by-barcode (403 when fetched; summary via search). MEDIUM
- Discogs app (barcode scanner, collection/wantlist, folders, filters): https://thevinylfactory.com/?p=29249 , https://archive.thevinylfactory.com/?p=34085. MEDIUM
- Version-picking practice (1–3 releases per barcode, filters, matrix codes, multiple copies): https://pmamagazine.org/the-vinyl-beat-special-edition-cataloging-your-collection-using-discogs/. MEDIUM
- SnapVinyl (OCR + barcode → Discogs): https://apps.apple.com/app/id6741057688. MEDIUM
- Shelf scanners: TitleEntry https://www.producthunt.com/posts/1241627 ; BiblioScan https://alternativeto.net/software/biblioscan/about/ ; Shelf Scan / FlipLit store listings; Gemini Book List Generator https://ai.google.dev/competition/projects/book-list-generator. MEDIUM (marketing claims)
- Delicious Library (barcode → Amazon lookup, shelf visuals): https://www.macworld.com/article/2038731/mac-gems-delicious-library-3-lets-you-track-your-movies-music-and-more.html. MEDIUM
- Batch CSV import UX (preview + error list before submit): https://guide.common-ground.io/en/articles/7328994-how-to-import-items-from-csv. MEDIUM
- Discogs collection fields (Media/Sleeve condition, Notes, custom fields), collection-by-release endpoint: https://support.discogs.com/hc/en-us/articles/360007425393 , https://python3-discogs-client.readthedocs.io/en/latest/fetching_data.html , https://minim.readthedocs.io/en/dev/api-ref/minim.api.discogs.UsersAPI.html. MEDIUM
- Per-user collection flags in authenticated search results: from knowledge of the API, not verified against official docs (developers page returned 403). LOW. Verify in the Discogs phase

---
*Feature research for: spine-photo → Discogs collection importer*
*Researched: 2026-10-18*
