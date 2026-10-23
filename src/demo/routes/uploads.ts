// Upload and re-scan routes (D-11, D-14, D-17). POST /api/photos reads the
// x-filename header and nothing else: the fetch shim already drops any
// non-string body, and this handler never looks at req.body, so a dropped
// file is never read beyond its name. Both answer the real routes' bodies
// and status codes (src/app/api/photos/route.ts, [id]/rescan/route.ts).
import { addUploadedPhoto, demoFilename, rescanPhoto } from '../ops/uploads';
import type { DemoRoute } from '../routes';
import { emit, getState, now } from '../store';
import { fail, isJson, reply } from './http';

export const routes: DemoRoute[] = [
  {
    method: 'POST',
    pattern: '/api/photos',
    handler: (req) => {
      const filename = demoFilename(req.headers.get('x-filename'));
      const result = addUploadedPhoto(getState(), filename, now());
      emit();
      return reply(201, result);
    },
  },
  {
    method: 'POST',
    pattern: '/api/photos/:id/rescan',
    handler: (req) => {
      if (!isJson(req)) {
        return fail(415, 'unsupported_type', 'Send application/json.');
      }
      // The demo's Claude CLI is always ready (D-12): no cli_unavailable.
      const result = rescanPhoto(getState(), req.params.id, now());
      switch (result.status) {
        case 'not_found':
          return fail(404, 'not_found', 'This photo no longer exists.');
        case 'active':
          return fail(
            409,
            'run_active',
            'This photo is already being analyzed.',
          );
        case 'started':
          emit();
          return reply(201, { runId: result.runId, runNo: result.runNo });
      }
    },
  },
];
