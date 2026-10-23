// Demo alias target for '@/lib/asset-urls' (D-08, next.config.ts demo
// branch). Covers are the generated SVGs under the basePath (one per
// recorded release, plan 05-02); crops are accepted only from the same
// static demo-assets folder (RESEARCH Pitfall 7, T-05-15).

function base(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? '';
}

function coverUrl(releaseId: number): string {
  return `${base()}/demo-assets/covers/${Math.trunc(releaseId)}.svg`;
}

export function candidateThumbSrc(c: {
  id: string;
  releaseId: number;
}): string {
  return coverUrl(c.releaseId);
}

export function searchThumbSrc(_searchId: string, releaseId: number): string {
  return coverUrl(releaseId);
}

export function isAppFileUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(`${base()}/demo-assets/`);
}
