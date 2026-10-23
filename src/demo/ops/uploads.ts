// Demo upload and re-scan (D-11, D-14, D-17). A dropped photo is never
// read: only its name arrives here. It gets one fake vision run of about
// 3 s (queued -> preparing -> calling -> parsing -> done), and when the run
// finishes a fresh copy of the sample shelf (pristineShelf) appears with its
// own 61 spines and auto searches. Re-scan appends a run with the same
// offsets and keeps the spines. Times are timestamps, never timers; the
// read model derives each status from now() (RESEARCH Pattern 3).
import { pristineShelf, SAMPLE_PHOTO_ID } from '../seed';
import {
  type DemoPhoto,
  type DemoPhotoRun,
  type DemoState,
  nextId,
} from '../store';

/** Offsets of one fake run from its queuedAt (about 3 s in total). */
export const RUN_OFFSETS = {
  preparing: 400,
  calling: 900,
  parsing: 2400,
  done: 3000,
} as const;

const MAX_FILENAME_CHARS = 255;
const FALLBACK_FILENAME = 'photo.jpg';
// C0/C1 controls and bidi overrides/isolates, as sanitizeFilename strips.
const CONTROL_CHARS = /[\p{Cc}‪-‮⁦-⁩]/gu;
const PATH_SEPARATORS = /[/\\]/g;

/**
 * The display name from the raw x-filename header, like the real
 * sanitizeFilename: decoded (kept as is when malformed), controls and path
 * separators stripped, trimmed, capped at 255 characters, with a fallback.
 */
export function demoFilename(raw: string | null | undefined): string {
  let name = raw ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // Not percent-encoded: keep the header text as is.
  }
  name = name.replace(CONTROL_CHARS, '').replace(PATH_SEPARATORS, '').trim();
  name = Array.from(name).slice(0, MAX_FILENAME_CHARS).join('').trim();
  return name || FALLBACK_FILENAME;
}

function newRun(runNo: number, queuedAt: number): DemoPhotoRun {
  return {
    runNo,
    queuedAt,
    preparingAt: queuedAt + RUN_OFFSETS.preparing,
    callingAt: queuedAt + RUN_OFFSETS.calling,
    parsingAt: queuedAt + RUN_OFFSETS.parsing,
    doneAt: queuedAt + RUN_OFFSETS.done,
    outcome: 'done',
    errorReason: null,
  };
}

function latestRun(photo: DemoPhoto): DemoPhotoRun | null {
  return photo.runs.length > 0 ? photo.runs[photo.runs.length - 1] : null;
}

/** A run is in flight until its doneAt (queued..parsing). */
function runActive(photo: DemoPhoto, now: number): boolean {
  const run = latestRun(photo);
  return run !== null && now < run.doneAt;
}

/**
 * A new photo named `filename` with a ~3 s run; the second shelf copy
 * becomes visible at the run's doneAt (D-17).
 */
export function addUploadedPhoto(
  state: DemoState,
  filename: string,
  now: number,
): { photoId: string; duplicate: false } {
  const sample = state.photos.find((p) => p.id === SAMPLE_PHOTO_ID);
  const photoId = nextId('demo-upload');
  const run = newRun(1, now);
  state.photos.push({
    id: photoId,
    filename,
    createdAt: now,
    runs: [run],
    model: 'claude-opus-5-5',
    spineCountEstimate: sample?.spineCountEstimate ?? null,
    densityFlags: [...(sample?.densityFlags ?? [])],
    thumbFile: sample?.thumbFile ?? null,
    visionFile: sample?.visionFile ?? null,
  });
  pristineShelf(state, photoId, run.doneAt);
  return { photoId, duplicate: false };
}

export type RescanResult =
  | { status: 'started'; runId: string; runNo: number }
  | { status: 'not_found' }
  | { status: 'active' };

/** Mirrors startRescan: refuse an unknown photo or one mid-run (D-14). */
export function rescanPhoto(
  state: DemoState,
  photoId: string,
  now: number,
): RescanResult {
  const photo = state.photos.find((p) => p.id === photoId);
  if (!photo) return { status: 'not_found' };
  if (runActive(photo, now)) return { status: 'active' };
  const runNo = (latestRun(photo)?.runNo ?? 0) + 1;
  photo.runs.push(newRun(runNo, now));
  return { status: 'started', runId: `${photoId}-run-${runNo}`, runNo };
}
