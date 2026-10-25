import 'server-only';
import { z } from 'zod';
import type { DiscogsFetchDeps } from '../../discogs/client';
import type { JobContext } from '../types';

// RED stub (Plan 06-02 Task 1).

export const ResolvePressingPayload = z.object({
  itemId: z.string().min(1),
});
export type ResolvePressingPayload = z.infer<typeof ResolvePressingPayload>;

export type ResolvePressingDeps = { fetch?: DiscogsFetchDeps };

export async function runResolvePressing(
  payload: unknown,
  _ctx: JobContext,
  _deps: ResolvePressingDeps = {},
): Promise<void> {
  ResolvePressingPayload.parse(payload);
}
