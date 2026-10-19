import 'server-only';
import type { JobHandler } from '../types';
import { runNoop } from './noop';

export const handlers: Record<string, JobHandler> = {
  noop: { run: runNoop, timeoutMs: 120000 },
};
