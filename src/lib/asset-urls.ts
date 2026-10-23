// Image URLs the client components build (D-08 seam). Client-safe: no
// imports. The demo build aliases this module to src/demo/asset-urls.ts
// (next.config.ts), which points at static basePath assets instead; the
// real app keeps exactly these route strings.

/** The candidate cover route (GET /api/discogs/thumb/{candidateId}). */
export function candidateThumbSrc(c: {
  id: string;
  releaseId: number;
}): string {
  return `/api/discogs/thumb/${encodeURIComponent(c.id)}`;
}

/** A Search Discogs dialog result's cover route. */
export function searchThumbSrc(searchId: string, releaseId: number): string {
  return `/api/discogs/searches/${encodeURIComponent(searchId)}/thumb/${releaseId}`;
}

/** Crop URLs only ever come from the app's /api/files allowlist (T-04-33). */
export function isAppFileUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/api/files/');
}
