// Discogs account routes (D-12): connect, finish (paste code), test,
// disconnect and folders. Bodies are strict copies of the real schemas and
// every status code and JSON body is the real one
// (src/app/api/discogs/{connect,finish,test,disconnect,folders}/route.ts).
// Connect answers a constant same-site URL built from NEXT_PUBLIC_BASE_PATH
// in ops/account.ts, never from request data (T-05-24).
import { z } from 'zod';
import {
  connect,
  disconnect,
  finish,
  readFolders,
  refreshFolders,
  test,
} from '../ops/account';
import type { DemoResponse, DemoRoute } from '../routes';
import { emit, getState, now } from '../store';
import { fail, isJson, parseRaw, readBody, reply } from './http';

const EmptyBody = z.strictObject({});
const FinishBody = z.strictObject({ code: z.string().max(200) });
const RefreshBody = z.strictObject({ refresh: z.literal(true) });

/** Test connection and Reload folders feel like one signed Discogs call. */
const DISCOGS_CALL_DELAY_MS = 400;

function discogsCall(body: unknown): DemoResponse {
  return { status: 200, body, delayMs: DISCOGS_CALL_DELAY_MS };
}

export const routes: DemoRoute[] = [
  {
    method: 'POST',
    pattern: '/api/discogs/connect',
    handler: (req) => {
      const body = readBody(req, EmptyBody);
      if (!body.ok) return body.response;
      const result = connect(getState(), now());
      if (result.status === 'credentials_missing') {
        return reply(409, { error: 'credentials_missing' });
      }
      emit();
      return reply(200, { authorizeUrl: result.authorizeUrl });
    },
  },
  {
    method: 'POST',
    pattern: '/api/discogs/finish',
    handler: (req) => {
      if (!isJson(req)) {
        return fail(415, 'unsupported_type', 'Send application/json.');
      }
      const raw = parseRaw(req);
      if (!raw.ok) {
        return fail(400, 'invalid_body', 'The request body is not JSON.');
      }
      const parsed = FinishBody.safeParse(raw.value);
      if (!parsed.success) {
        // Fixed text: the parse error must not echo what was pasted.
        return fail(400, 'invalid_body', 'The request body is not valid.');
      }
      const result = finish(getState(), parsed.data.code);
      if (result.status === 'empty') return reply(400, { error: 'empty' });
      emit();
      return reply(200, { username: result.username });
    },
  },
  {
    method: 'POST',
    pattern: '/api/discogs/test',
    handler: (req) => {
      const body = readBody(req, EmptyBody);
      if (!body.ok) return body.response;
      const result = test(getState());
      if (result.status === 'not_connected') {
        return reply(409, { error: 'not_connected' });
      }
      emit();
      return discogsCall(result.result);
    },
  },
  {
    method: 'POST',
    pattern: '/api/discogs/disconnect',
    handler: (req) => {
      const body = readBody(req, EmptyBody);
      if (!body.ok) return body.response;
      disconnect(getState());
      emit();
      return reply(200, { ok: true });
    },
  },
  {
    method: 'GET',
    pattern: '/api/discogs/folders',
    handler: () => ({ status: 200, body: readFolders(getState()) }),
  },
  {
    method: 'POST',
    pattern: '/api/discogs/folders',
    handler: (req) => {
      const body = readBody(req, RefreshBody);
      if (!body.ok) return body.response;
      const result = refreshFolders(getState(), now());
      if (result.status === 'not_connected') {
        return reply(409, { error: 'not_connected' });
      }
      emit();
      return discogsCall({ ok: true, ...result.result });
    },
  },
];
