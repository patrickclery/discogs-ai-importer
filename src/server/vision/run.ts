import 'server-only';
import path from 'node:path';
import {
  VISION_CALL_TIMEOUT_MS,
  VISION_MAX_OUTPUT_TOKENS,
  VISION_MAX_TURNS,
  type VisionEffort,
} from '@/lib/vision-contract';
import {
  buildClaudeArgs,
  buildClaudeEnv,
  claudeBin,
  claudeWorkDir,
  MODEL_ID,
} from '../claude/cli';
import { type RunResult, runProcess } from '../proc/run';
import { buildVisionPrompt } from './prompt';
import { visionJsonSchema } from './schema';

// The production vision call (VIS-01, RESEARCH Pattern 4): exactly one
// `claude -p` spawn per call, Read scoped to the directory that holds only
// the vision image, structured output via --json-schema. The RunResult is
// returned untouched; the caller records it before parsing (VIS-03).

/** Max characters kept per stream; at or above this, stdout is truncated. */
export const VISION_MAX_BUFFER = 8_000_000;

export type VisionCallArgs = {
  /** Absolute path of the vision JPEG, alone in its directory. */
  imagePath: string;
  width: number;
  height: number;
  model: string;
  effort: VisionEffort;
};

export function buildVisionArgs(opts: VisionCallArgs): string[] {
  if (!MODEL_ID.test(opts.model)) throw new Error('invalid model id');
  if (!path.isAbsolute(opts.imagePath)) {
    throw new Error('imagePath must be absolute');
  }
  return buildClaudeArgs({
    prompt: buildVisionPrompt({
      imagePath: opts.imagePath,
      width: opts.width,
      height: opts.height,
    }),
    model: opts.model,
    readDirs: [path.dirname(opts.imagePath)],
    jsonSchema: JSON.stringify(visionJsonSchema),
    effort: opts.effort,
    maxTurns: VISION_MAX_TURNS,
  });
}

export function buildVisionEnv(): NodeJS.ProcessEnv {
  const env = buildClaudeEnv();
  if (VISION_MAX_OUTPUT_TOKENS !== null) {
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(VISION_MAX_OUTPUT_TOKENS);
  }
  return env;
}

export function runVisionCall(
  opts: VisionCallArgs & { signal?: AbortSignal; timeoutMs?: number },
): Promise<RunResult> {
  return runProcess({
    command: claudeBin(),
    args: buildVisionArgs(opts),
    env: buildVisionEnv(),
    cwd: claudeWorkDir(),
    timeoutMs: opts.timeoutMs ?? VISION_CALL_TIMEOUT_MS,
    signal: opts.signal,
    maxBuffer: VISION_MAX_BUFFER,
  });
}
