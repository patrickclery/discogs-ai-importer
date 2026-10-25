# API Coverage — Discogs

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

| capability | decision | reason |
|---|---|---|
| master versions lookup (GET /masters/{id}/versions?country=&format=CD, page 1, sort released asc) | INTEGRATE | |
| versions country and format filters (exact-case) | INTEGRATE | |
| rate-limit handling (shared gate, 429 defer, X-Discogs-Ratelimit headers) | INTEGRATE | |
| add to collection folder (POST /users/{u}/collection/folders/{f}/releases/{id}) via the existing add_to_collection job | INTEGRATE | |
| collection read before add (GET /users/{u}/collection/releases/{id}, Phase 4 D-05/D-07 reconcile) | INTEGRATE | |
| version cover thumbnails (i.discogs.com via the existing thumb cache) | INTEGRATE | |
| versions pages beyond page 1 | OPT-OUT | D-01 allows one Discogs read per spine; sorting by earliest release puts the likeliest pick on page 1 |
| GET /masters/{id} to validate a master | OPT-OUT | D-21 forbids the extra request; the item cap and title guard cover unknown masters |
| GET /releases/{id} for the chosen version | OPT-OUT | not needed: the version entry carries title, label, catno, year, format and thumb, and D-01 limits each spine to one read |
| versions label and released facet filters | OPT-OUT | not needed: label and year are applied client-side by the D-03 tie-break |
