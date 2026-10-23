// In-browser fetch shim (D-15). A side-effect module imported by the
// rendered 'use client' DemoRoot (RESEARCH Pitfall 3): it wraps window.fetch
// once and sends every same-origin /api/* request to the demo dispatcher.
// Everything else (RSC payloads, chunks, demo assets) uses the real fetch.
// Works over plain http (no service worker, no secure context needed).
import { handle } from './routes';

declare global {
  interface Window {
    __demoFetchInstalled?: boolean;
  }
}

export type DemoFetchRequest = {
  method: string;
  url: URL;
  headers: Headers;
  /** The init body only when it is a string; a File/Blob is never read (D-11). */
  body: string | null;
};

/** Pure: the method, URL, headers and string body of a fetch call. */
export function toDemoRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  origin: string,
): DemoFetchRequest {
  const req = input instanceof Request ? input : null;
  const raw = req ? req.url : input instanceof URL ? input.href : String(input);
  const url = new URL(raw, origin);
  const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? req?.headers);
  const body = typeof init?.body === 'string' ? init.body : null;
  return { method, url, headers, body };
}

if (typeof window !== 'undefined' && !window.__demoFetchInstalled) {
  window.__demoFetchInstalled = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = toDemoRequest(input, init, window.location.origin);
    if (
      req.url.origin !== window.location.origin ||
      !req.url.pathname.startsWith('/api/')
    ) {
      return realFetch(input, init);
    }
    const res = await handle(req);
    return Response.json(res.body, { status: res.status });
  };
}
