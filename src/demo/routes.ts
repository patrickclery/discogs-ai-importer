// The demo "server" (D-03, D-15): a method + path route table answering the
// app's /api calls in the browser. Pure apart from the optional delay: the
// fetch shim and the tests both call handle(). Route groups live in
// ./routes/*.ts and each exports `routes: DemoRoute[]`, so later plans add
// handlers without editing this dispatcher.
import { routes as accountRoutes } from './routes/account';
import { routes as importRoutes } from './routes/imports';
import { routes as readRoutes } from './routes/read';
import { routes as reviewRoutes } from './routes/review';
import { routes as uploadRoutes } from './routes/uploads';

export type DemoRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: string | null;
  /** ':name' pattern segments, decodeURIComponent'd. */
  params: Record<string, string>;
};

export type DemoResponse = { status: number; body: unknown; delayMs?: number };

export type DemoRoute = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** e.g. '/api/spines/:id/import'; ':name' matches one path segment. */
  pattern: string;
  handler: (req: DemoRequest) => DemoResponse;
};

type Compiled = { route: DemoRoute; regex: RegExp; names: string[] };

function compile(route: DemoRoute): Compiled {
  const names: string[] = [];
  const source = route.pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        names.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { route, regex: new RegExp(`^${source}$`), names };
}

const ROUTES: DemoRoute[] = [
  ...readRoutes,
  ...reviewRoutes,
  ...importRoutes,
  ...uploadRoutes,
  ...accountRoutes,
];

const compiledCache = new WeakMap<readonly DemoRoute[], Compiled[]>();

function compiled(routes: readonly DemoRoute[]): Compiled[] {
  let c = compiledCache.get(routes);
  if (!c) {
    c = routes.map(compile);
    compiledCache.set(routes, c);
  }
  return c;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** The first route in `routes` matching method and path, with decoded params. */
export function matchRouteIn(
  routes: readonly DemoRoute[],
  method: string,
  path: string,
): { route: DemoRoute; params: Record<string, string> } | null {
  const m = method.toUpperCase();
  for (const c of compiled(routes)) {
    if (c.route.method !== m) continue;
    const hit = c.regex.exec(path);
    if (!hit) continue;
    const params: Record<string, string> = {};
    c.names.forEach((name, i) => {
      params[name] = safeDecode(hit[i + 1]);
    });
    return { route: c.route, params };
  }
  return null;
}

/** The first demo route matching method and path, with decoded params. */
export function matchRoute(
  method: string,
  path: string,
): { route: DemoRoute; params: Record<string, string> } | null {
  return matchRouteIn(ROUTES, method, path);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Answer one /api request; unmatched paths get 501 demo_not_implemented. */
export async function handle(req: {
  method: string;
  url: URL;
  headers: Headers;
  body: string | null;
}): Promise<DemoResponse> {
  const method = req.method.toUpperCase();
  const path = req.url.pathname;
  const hit = matchRoute(method, path);
  if (!hit) {
    console.warn(`[demo] no demo route for ${method} ${path}`);
    return { status: 501, body: { error: 'demo_not_implemented' } };
  }
  const res = hit.route.handler({
    method,
    path,
    query: req.url.searchParams,
    headers: req.headers,
    body: req.body,
    params: hit.params,
  });
  if (res.delayMs && res.delayMs > 0) await delay(res.delayMs);
  return res;
}
