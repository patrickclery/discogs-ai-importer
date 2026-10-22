# API Coverage — Discogs API v2

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 4 starts from the Phase 3 matrix (.planning/phases/03-discogs-match/COVERAGE.md) and re-decides every collection capability, because this is the first phase that writes to the owner's account.

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
| collection_folders_list | INTEGRATE | |
| collection_items_by_release | INTEGRATE | |
| collection_add_release | INTEGRATE | |
| collection_instance_delete | OPT-OUT | not needed yet: undo import is deferred (CONTEXT Deferred Ideas, DATA-01 v2); the client refuses DELETE (D-06) |
| collection_instance_edit_fields | OPT-OUT | not needed yet: notes, condition and shelf location on the copy are deferred (CONTEXT Deferred Ideas, DATA-04 v2) |
| collection_instance_move_folder | OPT-OUT | not needed: each import keeps the folder it was added to and there is no per-spine folder override (D-03) |
| collection_instance_rating | OPT-OUT | explicitly out of scope: ratings are excluded in REQUIREMENTS Out of Scope |
| collection_folder_get | OPT-OUT | not needed: the folders list already returns id, name and count |
| collection_folder_create | OPT-OUT | not needed: the owner creates folders on discogs.com and the app lists the existing ones (D-03) |
| collection_folder_rename | OPT-OUT | not needed: folder management stays on discogs.com |
| collection_folder_delete | OPT-OUT | explicitly out of scope: nothing on Discogs is deleted in this phase (D-06) |
| collection_items_by_folder | OPT-OUT | not needed: the per-release lookup covers the duplicate check, and listing whole folders costs paged requests |
| collection_value | OPT-OUT | explicitly out of scope: marketplace pricing is excluded |
| collection_custom_fields_list | OPT-OUT | not needed yet: custom fields are v2 (DATA-04) |
| collection_custom_fields_edit | OPT-OUT | not needed yet: shelf location notes are v2 (DATA-04) |
| search_user_data_in_collection | OPT-OUT | not needed: the flag on search results goes stale after the first import; the in-job collection read is authoritative (RESEARCH API Facts) |
| get_master_release | OPT-OUT | explicitly out of scope: candidates are release ids only (Phase 3 D-09, D-15) |
| get_master_versions | OPT-OUT | not needed: the owner picks a specific release, never a master |
| get_artist | OPT-OUT | not needed: candidates come from database search and release lookups |
| get_artist_releases | OPT-OUT | not needed: the search cascade covers artist lookups |
| get_label | OPT-OUT | not needed: label text comes back on search results |
| get_label_releases | OPT-OUT | not needed: the catalog-number stage covers label lookups |
| release_rating_by_user | OPT-OUT | explicitly out of scope: ratings are excluded in REQUIREMENTS Out of Scope |
| release_community_rating | OPT-OUT | explicitly out of scope: ratings are excluded in REQUIREMENTS Out of Scope |
| release_stats | OPT-OUT | not needed: have/want counts belong to deferred smarter ranking |
| user_profile_get | OPT-OUT | not needed: /oauth/identity already returns the username |
| user_profile_edit | OPT-OUT | explicitly out of scope: the only write in this phase is the add-to-collection POST (D-06) |
| user_submissions | OPT-OUT | explicitly out of scope: the Discogs API does not support release submission |
| user_contributions | OPT-OUT | not needed for an importer |
| wantlist | OPT-OUT | explicitly out of scope: wantlist is excluded in REQUIREMENTS Out of Scope |
| marketplace_inventory_listings_orders | OPT-OUT | explicitly out of scope: marketplace and selling are excluded |
| marketplace_price_suggestions_fees | OPT-OUT | explicitly out of scope: marketplace pricing is excluded |
| inventory_export_upload | OPT-OUT | explicitly out of scope: marketplace inventory is excluded |
| user_lists | OPT-OUT | not needed for an importer |

Plans: collection_folders_list (04-01 path builder and fake, 04-06 Settings select), collection_items_by_release (04-01 handler pre-check and reconcile, 04-02 hardening), collection_add_release (04-01 write gate and handler, 04-02 exactly-once).
