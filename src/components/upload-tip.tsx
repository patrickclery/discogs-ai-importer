import { Lightbulb } from 'lucide-react';

/** D-03 tip under the dropzone; N is the density spine-count setting. */
export function UploadTip({ maxSpines }: { maxSpines: number }) {
  return (
    <p className="-mt-4 flex items-start gap-2 text-xs text-muted-foreground">
      <Lightbulb aria-hidden="true" className="size-4 shrink-0" />
      <span>
        Tip: photograph one shelf section at a time, about {maxSpines} spines or
        fewer, so the text on each spine stays readable.
      </span>
    </p>
  );
}
