import 'server-only';
import type { JobHandler } from '../types';
import { runNoop } from './noop';
import { runScanPhoto } from './scan-photo';

export const handlers: Record<string, JobHandler> = {
  noop: { run: runNoop, timeoutMs: 120000 },
  // Longer than VISION_CALL_TIMEOUT_MS so the CLI's own timeout fires first.
  scan_photo: { run: runScanPhoto, timeoutMs: 720_000 },
};
