// Import routes (D-09, D-14): add, Change match, Link existing copy, Add
// another copy, Retry and Retry all failed. Bodies are strict copies of the
// real routes' schemas (empty-object bodies included), and every status
// code and JSON body is the real one (RESEARCH Pattern 2).
import { z } from 'zod';
import type { DuplicateBody } from '@/lib/import-types';
import {
  addAnotherCopy,
  cancelImport,
  linkExisting,
  retryAllFailed,
  retrySpine,
  startImport,
} from '../ops/imports';
import { discogsReady, findSpine, notConnectedMessage } from '../ops/review';
import type { DemoResponse, DemoRoute } from '../routes';
import { emit, getState, now } from '../store';
import { fail, readBody, reply } from './http';

const ImportBody = z.strictObject({
  candidateId: z.string().min(1).max(40),
  allowDuplicate: z.boolean().optional(),
});
const EmptyBody = z.strictObject({});
const RetryFailedBody = z.strictObject({
  photoId: z.string().min(1).max(40).optional(),
});

const SPINE_GONE = (): DemoResponse =>
  fail(404, 'not_found', 'This spine no longer exists.');

/** The real not_connected refusal, or null when Discogs is ready. */
function notConnected(): DemoResponse | null {
  const { account } = getState();
  if (discogsReady(account)) return null;
  return fail(409, 'not_connected', notConnectedMessage(account));
}

/** The real "SELECT 1 FROM spines" existence check (any state). */
function spineExists(id: string): boolean {
  return findSpine(getState(), id, now()) !== null;
}

export const routes: DemoRoute[] = [
  {
    method: 'POST',
    pattern: '/api/spines/:id/import',
    handler: (req) => {
      const parsed = readBody(req, ImportBody);
      if (!parsed.ok) return parsed.response;
      const refused = notConnected();
      if (refused) return refused;
      const result = startImport(
        getState(),
        { spineId: req.params.id, ...parsed.data },
        now(),
      );
      switch (result.status) {
        case 'not_found':
          return SPINE_GONE();
        case 'no_candidate':
          return fail(
            404,
            'no_candidate',
            'That match is no longer listed for this spine.',
          );
        case 'not_importable':
          return fail(
            409,
            'not_importable',
            'This spine can no longer be imported.',
          );
        case 'not_on_discogs':
          return fail(
            409,
            'not_on_discogs',
            'This spine is marked not on Discogs. Unmark it first.',
          );
        case 'retry_first':
          return fail(
            409,
            'retry_first',
            'Retry the import first. Discogs may already have added it.',
          );
        case 'already_confirmed':
          return fail(
            409,
            'already_confirmed',
            'This spine already has a match being added. It will show here in a moment.',
          );
        case 'duplicate': {
          const body: DuplicateBody = {
            error: 'duplicate',
            message:
              'This release is already going into your collection from another spine.',
            photo: result.photo,
            spineNumber: result.spineNumber,
            cropUrl: result.cropUrl,
            done: result.done,
          };
          return reply(409, body);
        }
        default:
          emit();
          return reply(201, { importId: result.importId });
      }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/spines/:id/import',
    handler: (req) => {
      const parsed = readBody(req, EmptyBody);
      if (!parsed.ok) return parsed.response;
      const result = cancelImport(getState(), req.params.id, now());
      switch (result) {
        case 'not_found':
          return fail(404, 'not_found', 'This spine has no match to change.');
        case 'started':
          return fail(
            409,
            'started',
            "It's already being added to Discogs, so the match can't be changed now.",
          );
        case 'checking':
          emit();
          return reply(202, { checking: true });
        default:
          emit();
          return reply(200, { cancelled: true });
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/import/link-existing',
    handler: (req) => {
      const parsed = readBody(req, EmptyBody);
      if (!parsed.ok) return parsed.response;
      const result = linkExisting(getState(), req.params.id, now());
      switch (result.status) {
        case 'not_found':
          return fail(404, 'not_found', 'This spine has no import to link.');
        case 'not_held':
          return fail(
            409,
            'not_held',
            'This spine is not waiting on that choice any more.',
          );
        case 'no_existing':
          return fail(
            409,
            'no_existing',
            'That copy is already linked to another spine.',
          );
        default:
          emit();
          return reply(200, {
            importId: result.importId,
            instanceId: result.instanceId,
          });
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/import/another',
    handler: (req) => {
      const parsed = readBody(req, EmptyBody);
      if (!parsed.ok) return parsed.response;
      if (!spineExists(req.params.id)) return SPINE_GONE();
      const refused = notConnected();
      if (refused) return refused;
      const result = addAnotherCopy(getState(), req.params.id, now());
      switch (result.status) {
        case 'not_found':
          return fail(404, 'not_found', 'This spine has no import to add.');
        case 'not_held':
          return fail(
            409,
            'not_held',
            'This spine is not waiting on that choice any more.',
          );
        default:
          emit();
          return reply(201, { importId: result.importId });
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/retry',
    handler: (req) => {
      const parsed = readBody(req, EmptyBody);
      if (!parsed.ok) return parsed.response;
      if (!spineExists(req.params.id)) return SPINE_GONE();
      const refused = notConnected();
      if (refused) return refused;
      const result = retrySpine(getState(), req.params.id, now());
      switch (result.status) {
        case 'not_found':
          return SPINE_GONE();
        case 'nothing_to_retry':
          return fail(409, 'nothing_to_retry', 'Nothing failed on this spine.');
        case 'busy':
          return fail(409, 'busy', "It's already waiting or running.");
        default:
          emit();
          return reply(
            201,
            result.kind === 'import'
              ? { kind: 'import', importId: result.importId }
              : { kind: 'search', searchId: result.searchId },
          );
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/retry-failed',
    handler: (req) => {
      const parsed = readBody(req, RetryFailedBody);
      if (!parsed.ok) return parsed.response;
      const body = retryAllFailed(getState(), parsed.data.photoId, now());
      if (body.retried > 0) emit();
      return reply(200, body);
    },
  },
];
