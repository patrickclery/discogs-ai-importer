'use client';

import { cn } from 'cn';
import { ImageUp } from 'lucide-react';
import { type FileRejection, useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '@/lib/scan-types';

/** react-dropzone wrapper for shelf photos (UI-SPEC /upload item 3, D-12). */
export function Dropzone({
  disabled = false,
  onDrop,
}: {
  disabled?: boolean;
  onDrop: (accepted: File[], rejections: FileRejection[]) => void;
}) {
  const { getRootProps, getInputProps, open, isDragAccept, isDragReject } =
    useDropzone({
      accept: ACCEPTED_UPLOAD_TYPES,
      multiple: true,
      maxSize: MAX_UPLOAD_BYTES,
      disabled,
      onDrop: (accepted, rejections) => onDrop(accepted, rejections),
    });

  const reject = !disabled && isDragReject;
  const accept = !disabled && isDragAccept && !reject;

  let heading = 'Drop shelf photos here';
  if (accept) heading = 'Release to upload';
  if (reject) heading = 'Only photos can be uploaded here';

  return (
    <div
      {...getRootProps({
        role: 'group',
        'aria-label': 'Upload shelf photos',
        className: cn(
          'flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center outline-none transition-colors motion-reduce:transition-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          accept
            ? 'border-primary bg-primary/5'
            : reject
              ? 'border-destructive bg-destructive/5'
              : 'border-border bg-muted/40',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        ),
      })}
    >
      <input {...getInputProps()} />
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <ImageUp
          aria-hidden="true"
          className={cn(
            'size-5',
            accept ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      </div>
      <p className="text-base font-medium">{heading}</p>
      <p
        className={cn(
          'text-xs',
          reject ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        JPEG, PNG, WebP or HEIC, up to 64 MB each
      </p>
      <Button
        type="button"
        className="mt-2"
        disabled={disabled}
        onClick={(event) => {
          // The root also opens the picker on click; open it once.
          event.stopPropagation();
          open();
        }}
      >
        Choose photos
      </Button>
    </div>
  );
}
