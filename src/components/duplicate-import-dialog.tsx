'use client';

import { ImageOff } from 'lucide-react';
import type { MouseEvent } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import type { DuplicateBody } from '@/lib/import-types';
import { duplicateDialogTitle } from '@/lib/import-view';

// The local duplicate dialog (UI-SPEC Local duplicate dialog, D-04,
// IMP-03): Add answered 409 duplicate because another listed spine already
// holds this release. Both crops sit side by side so the owner can tell an
// overlapping photo of the same CD from a genuine second copy. Nothing is
// written until "Add another copy", which the Add button resends with
// allowDuplicate. The Add button owns the request; this dialog only shows
// it (pending, inline error).

/** UI-SPEC Copywriting: the duplicate dialog body. */
export const DUPLICATE_DIALOG_BODY =
  'This release is already going into your collection from another spine. If both photos show the same CD, cancel. Add another copy only if you own two.';

/** Crop URLs only ever come from the /api/files allowlist (T-04-33). */
function safeCropUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.startsWith('/api/files/') ? url : null;
}

/**
 * Read a 409 answer as the DuplicateBody, or null when it is something
 * else (the Add button then shows its inline error instead).
 */
export function parseDuplicateBody(raw: unknown): DuplicateBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (
    b.error !== 'duplicate' ||
    typeof b.photo !== 'string' ||
    typeof b.spineNumber !== 'number' ||
    typeof b.done !== 'boolean'
  ) {
    return null;
  }
  return {
    error: 'duplicate',
    message: typeof b.message === 'string' ? b.message : '',
    photo: b.photo,
    spineNumber: b.spineNumber,
    cropUrl: typeof b.cropUrl === 'string' ? b.cropUrl : null,
    done: b.done,
  };
}

function CropWell({
  url,
  alt,
  caption,
}: {
  url: string | null;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      {url ? (
        // biome-ignore lint/performance/noImgElement: crops stream from a route handler; next/image would re-encode them
        <img
          src={url}
          alt={alt}
          decoding="async"
          className="h-auto max-h-12 w-auto max-w-full self-start rounded-md bg-muted object-contain"
        />
      ) : (
        <div className="flex h-12 w-24 items-center justify-center rounded-md bg-muted">
          <ImageOff
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </div>
      )}
      <figcaption
        title={caption}
        className="line-clamp-2 text-xs break-all text-muted-foreground"
      >
        {caption}
      </figcaption>
    </figure>
  );
}

export function DuplicateImportDialog({
  duplicate,
  spineNumber,
  cropUrl,
  pending,
  error,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
}: {
  /** The 409 answer; the dialog is open while it is set. */
  duplicate: DuplicateBody | null;
  /** This spine's number on its photo (#n). */
  spineNumber: number;
  /** This spine's crop URL, if it has one. */
  cropUrl: string | null;
  pending: boolean;
  /** The inline error after a failed "Add another copy", or null. */
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Where focus goes once the dialog has closed. */
  onCloseAutoFocus: (e: Event) => void;
}) {
  const ownCaption = `This spine (#${spineNumber})`;
  const otherCaption = duplicate
    ? `${duplicate.photo}, spine #${duplicate.spineNumber}`
    : '';

  function confirm(e: MouseEvent<HTMLButtonElement>) {
    // Keep the dialog open until the request settles.
    e.preventDefault();
    onConfirm();
  }

  return (
    <AlertDialog
      open={duplicate !== null}
      onOpenChange={(o) => {
        if (pending || o) return;
        onCancel();
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words [overflow-wrap:anywhere]">
            {duplicate ? duplicateDialogTitle(duplicate) : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {DUPLICATE_DIALOG_BODY}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CropWell
            url={safeCropUrl(cropUrl)}
            alt={`Spine ${spineNumber}`}
            caption={ownCaption}
          />
          <CropWell
            url={safeCropUrl(duplicate?.cropUrl)}
            alt={otherCaption}
            caption={otherCaption}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={confirm}>
            {pending ? (
              <>
                <Spinner aria-hidden="true" role="presentation" />
                Adding…
              </>
            ) : (
              'Add another copy'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
