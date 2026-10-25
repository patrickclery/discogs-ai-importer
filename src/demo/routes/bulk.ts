// The bulk start route (D-07, D-08, D-17): the demo twin of
// POST /api/spines/bulk-import. Same strict body, refusals, status codes and
// messages as the real route; the run itself is the in-memory startBulk
// (Plan 06-11), so no request leaves the browser (T-06-18).
import { BULK_START_BODY, type BulkStartResponse } from '@/lib/bulk-types';
import { startBulk } from '../ops/bulk';
import { discogsReady, notConnectedMessage } from '../ops/review';
import type { DemoRoute } from '../routes';
import { emit, getState, now } from '../store';
import { fail, readBody, reply } from './http';

export const routes: DemoRoute[] = [
  {
    method: 'POST',
    pattern: '/api/spines/bulk-import',
    handler: (req) => {
      const parsed = readBody(req, BULK_START_BODY);
      if (!parsed.ok) return parsed.response;
      const { account } = getState();
      if (!discogsReady(account)) {
        return fail(409, 'not_connected', notConnectedMessage(account));
      }
      const result = startBulk(getState(), parsed.data.items, now());
      switch (result.status) {
        case 'busy':
          return fail(
            409,
            'bulk_running',
            'Wait for the current bulk import to finish',
          );
        case 'nothing':
          return fail(
            409,
            'nothing_to_import',
            'None of the picked spines can be imported now',
          );
        default: {
          emit();
          const body: BulkStartResponse = {
            runId: result.runId,
            started: result.started,
            skipped: result.skipped,
          };
          return reply(201, body);
        }
      }
    },
  },
];
