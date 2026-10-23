// Spine review routes (D-13, D-14): fields, search, the Search Discogs
// dialog's search reads, candidates, not on Discogs, re-attach and
// dismiss. Bodies are strict copies of the real routes' schemas, and every
// status code and JSON body is the real one (RESEARCH Pattern 2).
import { z } from 'zod';
import { MASTER_REFUSAL } from '@/lib/discogs-ref';
import { type CandidatesResponse, DIALOG_INPUT_MAX } from '@/lib/discogs-types';
import { MAX_FIELD_CHARS } from '@/lib/spine-review';
import { SPINE_FIELDS } from '@/lib/vision-contract';
import {
  addManualCandidate,
  dialogSearchDto,
  dismissSpine,
  editField,
  findSpine,
  isListed,
  listReattachCandidates,
  reattachSpine,
  setNotOnDiscogs,
  startSearch,
} from '../ops/review';
import { candidatesOf } from '../read-model';
import type { DemoRoute } from '../routes';
import { emit, getState, now } from '../store';
import { fail, isJson, parseRaw, readBody, reply } from './http';

const SPINE_NOT_FOUND = {
  error: 'not_found',
  message: 'This spine no longer exists.',
};

// PATCH /api/spines/:id/fields (bare { error } bodies, like the real route).
const Edit = z.strictObject({
  field: z.enum(SPINE_FIELDS),
  value: z.string().max(MAX_FIELD_CHARS).nullable(),
});
const Revert = z.strictObject({
  field: z.enum(SPINE_FIELDS),
  revert: z.literal(true),
});
const FieldsBody = z.union([Edit, Revert]);

const Value = z.string().max(DIALOG_INPUT_MAX);
const SearchBody = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('again') }),
  z.strictObject({ mode: z.literal('text'), value: Value }),
  z.strictObject({ mode: z.literal('ref'), value: Value }),
]);

const CandidateBody = z.strictObject({
  searchId: z.string().min(1).max(100),
  releaseId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const FlagBody = z.strictObject({ flag: z.boolean() });
const ReattachBody = z.strictObject({ targetSpineId: z.string().min(1) });

export const routes: DemoRoute[] = [
  {
    method: 'PATCH',
    pattern: '/api/spines/:id/fields',
    handler: (req) => {
      if (!isJson(req)) {
        return reply(415, { error: 'content-type must be application/json' });
      }
      const raw = parseRaw(req);
      if (!raw.ok) return reply(400, { error: 'invalid JSON body' });
      const parsed = FieldsBody.safeParse(raw.value);
      if (!parsed.success) {
        return reply(400, { error: z.prettifyError(parsed.error) });
      }
      const body = parsed.data;
      const result = editField(
        getState(),
        req.params.id,
        body.field,
        'revert' in body ? { revert: true } : { value: body.value },
        now(),
      );
      if (!result.ok) {
        return result.error === 'not_found'
          ? reply(404, { error: 'spine not found' })
          : reply(409, { error: 'this spine can no longer be edited' });
      }
      emit();
      return reply(200, result.field);
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/search',
    handler: (req) => {
      const parsed = readBody(req, SearchBody);
      if (!parsed.ok) return parsed.response;
      const result = startSearch(getState(), req.params.id, parsed.data, now());
      switch (result.status) {
        case 'ok':
          emit();
          return reply(201, { searchId: result.searchId });
        case 'empty':
          return fail(400, 'invalid_body', 'Type something to search for.');
        case 'master':
          return fail(400, 'master', MASTER_REFUSAL);
        case 'invalid_ref':
          return fail(
            400,
            'invalid_ref',
            'That is not a Discogs release link or number.',
          );
        case 'not_found':
          return reply(404, SPINE_NOT_FOUND);
        case 'not_searchable':
          return fail(
            409,
            'not_searchable',
            'This spine can no longer be searched.',
          );
        case 'not_connected':
          return fail(409, 'not_connected', result.message);
        case 'busy':
          return fail(
            409,
            'busy',
            'A search for this spine is already waiting or running',
          );
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/discogs/searches/:id',
    handler: (req) => {
      const dto = dialogSearchDto(getState(), req.params.id, now());
      if (!dto) {
        return {
          status: 404,
          body: {
            error: 'not_found',
            message: 'This search no longer exists.',
          },
        };
      }
      return { status: 200, body: dto };
    },
  },
  {
    method: 'GET',
    pattern: '/api/spines/:id/candidates',
    handler: (req) => {
      const state = getState();
      const t = now();
      const spine = findSpine(state, req.params.id, t);
      if (!spine || !isListed(spine)) {
        return { status: 404, body: SPINE_NOT_FOUND };
      }
      const body: CandidatesResponse = {
        candidates: candidatesOf(state, spine.id, t),
      };
      return { status: 200, body };
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/candidates',
    handler: (req) => {
      const parsed = readBody(req, CandidateBody);
      if (!parsed.ok) return parsed.response;
      const state = getState();
      const t = now();
      const spine = findSpine(state, req.params.id, t);
      if (!spine || !isListed(spine)) return reply(404, SPINE_NOT_FOUND);
      const result = addManualCandidate(
        state,
        { spineId: spine.id, ...parsed.data },
        t,
      );
      switch (result.status) {
        case 'search_not_found':
          return fail(
            404,
            'search_not_found',
            'That search is not a Search Discogs search of this spine.',
          );
        case 'release_not_found':
          return fail(
            404,
            'release_not_found',
            "That release isn't among the search's results.",
          );
        case 'not_done':
          return fail(
            409,
            'not_done',
            "The search hasn't finished with results yet.",
          );
        default: {
          emit();
          const candidate = candidatesOf(state, spine.id, t).find(
            (c) => c.id === result.candidateId,
          );
          if (!candidate) return reply(404, SPINE_NOT_FOUND);
          return reply(201, { candidate });
        }
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/not-on-discogs',
    handler: (req) => {
      const parsed = readBody(req, FlagBody);
      if (!parsed.ok) return parsed.response;
      const id = req.params.id;
      const result = setNotOnDiscogs(getState(), id, parsed.data.flag, now());
      switch (result.status) {
        case 'not_found':
          return fail(404, 'not_found', 'This spine no longer exists.');
        case 'not_markable':
          return fail(
            409,
            'not_markable',
            "This spine is no longer in the list, so it can't be marked.",
          );
        case 'imported':
          return fail(
            409,
            'imported',
            "This spine is already in your collection, so it can't be marked.",
          );
        case 'import_open':
          return fail(
            409,
            'import_open',
            'This spine has a match being added. Change the match first.',
          );
        default:
          emit();
          return reply(200, { id, notOnDiscogs: result.notOnDiscogs });
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/spines/:id/reattach',
    handler: (req) => {
      const result = listReattachCandidates(getState(), req.params.id, now());
      if (result.status !== 'ok') return { status: 404, body: SPINE_NOT_FOUND };
      return { status: 200, body: { candidates: result.value } };
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/reattach',
    handler: (req) => {
      const parsed = readBody(req, ReattachBody);
      if (!parsed.ok) return parsed.response;
      const result = reattachSpine(
        getState(),
        req.params.id,
        parsed.data.targetSpineId,
        now(),
      );
      if (result.status === 'not_found') return reply(404, SPINE_NOT_FOUND);
      if (result.status === 'conflict') {
        return fail(
          409,
          'conflict',
          'That spine can no longer be re-attached there.',
        );
      }
      emit();
      return reply(200, result.value);
    },
  },
  {
    method: 'POST',
    pattern: '/api/spines/:id/dismiss',
    handler: (req) => {
      if (!isJson(req)) {
        return fail(415, 'unsupported_type', 'Send application/json.');
      }
      const id = req.params.id;
      const result = dismissSpine(getState(), id, now());
      switch (result) {
        case 'not_found':
          return fail(404, 'not_found', 'This spine no longer exists.');
        case 'has_import':
          return fail(
            409,
            'has_import',
            "Spines with a match being added or already added can't be dismissed.",
          );
        case 'conflict':
          return fail(
            409,
            'conflict',
            'Only a spine that is no longer detected can be dismissed.',
          );
        default:
          emit();
          return reply(200, { id, state: 'dismissed' });
      }
    },
  },
];
