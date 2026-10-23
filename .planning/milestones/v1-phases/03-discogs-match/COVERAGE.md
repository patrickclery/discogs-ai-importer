# API Coverage — Discogs API v2

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

| capability | decision | reason |
|---|---|---|
| oauth_request_token | INTEGRATE | |
| oauth_authorize_redirect | INTEGRATE | |
| oauth_access_token | INTEGRATE | |
| oauth_identity | INTEGRATE | |
| rate_limit_headers | INTEGRATE | |
| database_search | INTEGRATE | |
| get_release | INTEGRATE | |
| image_thumbnails | INTEGRATE | |
| get_master_release | OPT-OUT | explicitly out of scope: D-09 and D-15 use type=release only and reject master links |
| get_master_versions | OPT-OUT | not needed: the owner picks a specific release, never a master |
| get_artist | OPT-OUT | not needed: candidates come from database search and release lookups |
| get_artist_releases | OPT-OUT | not needed: the search cascade covers artist lookups |
| get_label | OPT-OUT | not needed: label text comes back on search results |
| get_label_releases | OPT-OUT | not needed: the catalog-number stage covers label lookups |
| release_rating_by_user | OPT-OUT | explicitly out of scope: ratings are excluded in REQUIREMENTS Out of Scope |
| release_community_rating | OPT-OUT | explicitly out of scope: ratings are excluded in REQUIREMENTS Out of Scope |
| release_stats | OPT-OUT | not needed: have/want counts are deferred ranking (FEATURES P2) |
| user_profile_get | OPT-OUT | not needed: /oauth/identity already returns the username |
| user_profile_edit | OPT-OUT | explicitly out of scope: Phase 3 never writes to the owner's account |
| user_submissions | OPT-OUT | explicitly out of scope: the Discogs API does not support release submission |
| user_contributions | OPT-OUT | not needed for an importer |
| collection_folders_list | OPT-OUT | not needed yet: folder choice is Phase 4 (IMP-02) |
| collection_folder_create_edit_delete | OPT-OUT | not needed: imports use an existing folder (Uncategorized by default) |
| collection_items_by_release | OPT-OUT | not needed yet: the already-in-collection warning is Phase 4 (IMP-03) |
| collection_add_release | OPT-OUT | not needed yet: adding to the collection is Phase 4 (IMP-01, IMP-02) |
| collection_instance_edit_delete | OPT-OUT | not needed yet: undo import is v2 (DATA-01) |
| collection_custom_fields | OPT-OUT | not needed yet: shelf location notes are v2 (DATA-04) |
| collection_value | OPT-OUT | explicitly out of scope: marketplace pricing is excluded |
| wantlist | OPT-OUT | explicitly out of scope: wantlist is excluded in REQUIREMENTS Out of Scope |
| marketplace_inventory_listings_orders | OPT-OUT | explicitly out of scope: marketplace and selling are excluded |
| marketplace_price_suggestions_fees | OPT-OUT | explicitly out of scope: marketplace pricing is excluded |
| inventory_export_upload | OPT-OUT | explicitly out of scope: marketplace inventory is excluded |
| user_lists | OPT-OUT | not needed for an importer |
