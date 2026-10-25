// Read-only demo routes: GET /api/spines, /api/photos and /api/status.
import { parseStatusParam } from '@/lib/review-status';
import {
  buildPhotosResponse,
  buildSpinesResponse,
  buildStatusResponse,
} from '../read-model';
import type { DemoRoute } from '../routes';
import { getState, now } from '../store';

export const routes: DemoRoute[] = [
  {
    method: 'GET',
    pattern: '/api/spines',
    handler: (req) => ({
      status: 200,
      body: buildSpinesResponse(getState(), now(), {
        photoId: req.query.get('photo') || undefined,
        review: req.query.get('review') === '1',
        status: parseStatusParam(req.query.get('status')),
        fallback: req.query.get('fallback') === '1',
      }),
    }),
  },
  {
    method: 'GET',
    pattern: '/api/photos',
    handler: () => ({
      status: 200,
      body: buildPhotosResponse(getState(), now()),
    }),
  },
  {
    method: 'GET',
    pattern: '/api/status',
    handler: () => ({
      status: 200,
      body: buildStatusResponse(getState(), now()),
    }),
  },
];
