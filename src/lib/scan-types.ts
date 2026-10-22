// Scan DTOs and constants shared by routes and client components.
// Client-safe: no server-only import here.
import type { SpineDiscogsDto } from './discogs-types';
import type { ImportDto } from './import-types';
import type { Legibility, MediaKind, SpineField } from './vision-contract';

/** Status of a photo = status of its latest vision run. */
export const PHOTO_STATUSES = [
  'queued',
  'preparing',
  'calling',
  'parsing',
  'done',
  'error',
] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const SPINE_STATES = [
  'active',
  'superseded',
  'orphaned',
  'dismissed',
] as const;
export type SpineState = (typeof SPINE_STATES)[number];

/** Dense-shelf warnings stored per run (D-03). */
export const DENSITY_FLAGS = [
  'too_many_spines',
  'small_spines',
  'overlapping',
  'out_of_order',
] as const;
export type DensityFlag = (typeof DENSITY_FLAGS)[number];

export const UPLOAD_ERROR_CODES = [
  'unsupported_type',
  'too_large',
  'cut_off',
  'length_required',
  'empty',
] as const;
export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

/** Upload body cap (T-02-09); next.config proxyClientMaxBodySize matches. */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/** Accepted upload MIME types and extensions (D-06), react-dropzone shape. */
export const ACCEPTED_UPLOAD_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
} as const satisfies Record<string, readonly string[]>;

export type SpineFieldDto = {
  field: SpineField;
  aiValue: string | null;
  value: string | null;
  confidence: number;
  editBaseAiValue: string | null;
};

export type PhotoDto = {
  id: string;
  filename: string;
  createdAt: number;
  status: PhotoStatus;
  runNo: number;
  model: string | null;
  modelLabel: string | null;
  spawnedAt: number | null;
  finishedAt: number | null;
  errorReason: string | null;
  /** Active spines on this photo. */
  spineCount: number;
  spineCountEstimate: number | null;
  detectedCount: number | null;
  /** Done run that returned under 80% of Claude's own spine estimate. */
  truncated: boolean;
  densityFlags: DensityFlag[];
  thumbUrl: string | null;
  visionUrl: string | null;
  /** An earlier run of this photo finished (its spines are still shown). */
  hasEarlierScan: boolean;
};

export type SpineDto = {
  id: string;
  photoId: string;
  index: number;
  state: SpineState;
  legibility: Legibility | null;
  crop: { url: string; width: number; height: number } | null;
  /** In SPINE_FIELDS order. */
  fields: SpineFieldDto[];
  createdRunId: string | null;
  orphanedRunNo: number | null;
  /** From the current detection: only cd spines are looked up automatically. */
  mediaKind: MediaKind | null;
  /** The Discogs search summary; null outside the /spines read model. */
  discogs: SpineDiscogsDto | null;
  /** The latest import (IMP-01, IMP-04); null without one or outside /spines. */
  import: ImportDto | null;
  /** The owner marked the spine not on Discogs (REV-05). */
  notOnDiscogs: boolean;
};

export type PhotosResponse = { photos: PhotoDto[] };

/** One entry of the /spines photo filter (every photo, newest first). */
export type PhotoOption = Pick<PhotoDto, 'id' | 'filename' | 'status'>;

export type SpinesResponse = {
  /** Photos with a section under the current filters. */
  photos: PhotoDto[];
  spines: SpineDto[];
  /** Every photo, newest first, for the photo Select and polling. */
  photoOptions: PhotoOption[];
  /** Within the photo filter, ignoring the review filter. */
  counts: { all: number; needsReview: number };
  confidenceThreshold: number;
  densityMaxSpines: number;
  /** A search for a listed spine is queued or running (poll while true). */
  discogsActive: boolean;
  /**
   * connected: signed in and not refused by Discogs (the search route's
   * check). needsReconnect: signed in, but Discogs refused it (WR-05).
   */
  discogs: {
    connected: boolean;
    needsReconnect: boolean;
    pausedUntil: number | null;
    /** The folder new imports go to (D-03): the Add label names it. */
    folder: { id: number; name: string };
  };
};

export type UploadResponse = { photoId: string; duplicate: boolean };

export type UploadErrorBody = { error: UploadErrorCode; message: string };
