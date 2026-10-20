'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, TriangleAlert, Undo2 } from 'lucide-react';
import {
  type ChangeEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SpineFieldDto, SpinesResponse } from '@/lib/scan-types';
import {
  confidencePct,
  FIELD_LABELS,
  isEdited,
  isLowConfidence,
  lowConfidenceTooltip,
  MAX_FIELD_CHARS,
  normalizeFieldInput,
  rescanHint,
  resolveDisplayedValue,
  revertTooltip,
  withSpineField,
} from '@/lib/spine-review';

type PatchBody =
  | { field: SpineFieldDto['field']; value: string | null }
  | { field: SpineFieldDto['field']; revert: true };

async function patchField(
  spineId: string,
  body: PatchBody,
): Promise<SpineFieldDto> {
  let res: Response;
  try {
    res = await fetch(`/api/spines/${encodeURIComponent(spineId)}/fields`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('the app could not be reached');
  }
  if (!res.ok) {
    let reason = `the server returned ${res.status}`;
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j.error === 'string' && j.error) reason = j.error;
    } catch {
      // keep the status reason
    }
    throw new Error(reason);
  }
  return (await res.json()) as SpineFieldDto;
}

/** The field as it will read once the PATCH lands (optimistic cache). */
function optimistic(f: SpineFieldDto, body: PatchBody): SpineFieldDto {
  if ('revert' in body)
    return { ...f, value: f.aiValue, editBaseAiValue: null };
  return {
    ...f,
    value: body.value,
    editBaseAiValue: body.value === f.aiValue ? null : f.aiValue,
  };
}

/** Error copy without a doubled full stop when the reason ends in one. */
function saveError(err: unknown): string {
  const reason = (err instanceof Error ? err.message : String(err)).replace(
    /[.\s]+$/,
    '',
  );
  return `Not saved: ${reason}. Leave the field again to retry.`;
}

/**
 * One editable spine field (REV-02, D-08..D-10). The input keeps a local
 * draft; while it is focused or holds unsaved text, polled data never changes
 * it (RESEARCH Pitfall 6). Leaving the field saves through PATCH
 * /api/spines/{id}/fields with an optimistic cache update. Low-confidence
 * reads get the warning border and icon (D-09); edited fields get the
 * "Edited" badge and a revert button with an undo toast. After a re-scan, an
 * edited field whose new read differs shows that read under the control with
 * a one-click button to take it (D-15, rescanHint).
 */
export function SpineField({
  spineId,
  field: f,
  threshold,
  className,
}: {
  spineId: string;
  field: SpineFieldDto;
  threshold: number;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const label = FIELD_LABELS[f.field];
  const multiline = f.field === 'raw_text';
  const qc = useQueryClient();
  const [draft, setDraft] = useState(f.value ?? '');
  const [focused, setFocused] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const skipCommit = useRef(false);

  const mutation = useMutation({
    mutationFn: (body: PatchBody) => patchField(spineId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['spines'] });
      const previous = qc.getQueriesData<SpinesResponse>({
        queryKey: ['spines'],
      });
      qc.setQueriesData<SpinesResponse>({ queryKey: ['spines'] }, (old) =>
        withSpineField(old, spineId, optimistic(f, body)),
      );
      return { previous };
    },
    onSuccess: (saved) => {
      qc.setQueriesData<SpinesResponse>({ queryKey: ['spines'] }, (old) =>
        withSpineField(old, spineId, saved),
      );
    },
    onError: (_err, _body, ctx) => {
      // The cache goes back to the last saved state; the draft stays.
      for (const [key, data] of ctx?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['spines'] }),
  });

  const edited = isEdited(f);
  const low = isLowConfidence(f, threshold);
  const latestRead = rescanHint(f);
  const pct = confidencePct(f.confidence);
  const shown = resolveDisplayedValue({
    serverValue: f.value,
    draft,
    focused,
    dirty,
  });

  function setDraftValue(v: string) {
    draftRef.current = v;
    setDraft(v);
  }

  function save(value: string | null) {
    mutation.mutate(
      { field: f.field, value },
      {
        onSuccess: (saved) => {
          setError(null);
          if (normalizeFieldInput(draftRef.current) === saved.value) {
            setDirty(false);
          }
        },
        // No toast and no rollback: the draft stays and the next blur retries.
        onError: (err) => {
          setError(saveError(err));
          setDirty(true);
        },
      },
    );
  }

  function commit() {
    const next = normalizeFieldInput(draftRef.current);
    if (next === f.value) {
      setDirty(false);
      setError(null);
      return;
    }
    save(next);
  }

  function revert() {
    const previous = f.value;
    mutation.mutate(
      { field: f.field, revert: true },
      {
        onSuccess: (saved) => {
          setDraftValue(saved.value ?? '');
          setDirty(false);
          setError(null);
          toast(`${label} reverted to Claude's read`, {
            action: {
              label: 'Undo revert',
              onClick: () => {
                setDraftValue(previous ?? '');
                save(previous);
              },
            },
          });
        },
        onError: (err) => setError(saveError(err)),
      },
    );
  }

  function takeNewRead(read: string) {
    setDraftValue(read);
    setDirty(false);
    save(read);
  }

  function onFocus() {
    if (!dirty) setDraftValue(f.value ?? '');
    setFocused(true);
  }

  function onBlur() {
    setFocused(false);
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    commit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const commitKey = multiline
      ? e.key === 'Enter' && (e.ctrlKey || e.metaKey)
      : e.key === 'Enter';
    if (commitKey) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraftValue(f.value ?? '');
      setDirty(false);
      setError(null);
      skipCommit.current = true;
      e.currentTarget.blur();
    }
  }

  const describedBy =
    [low ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  const controlProps = {
    id,
    name: f.field,
    value: shown,
    maxLength: MAX_FIELD_CHARS,
    placeholder: f.aiValue === null && shown === '' ? 'Not read' : undefined,
    spellCheck: false,
    autoComplete: 'off',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: low ? 'border-warning focus-visible:ring-warning/40' : undefined,
    onFocus,
    onBlur,
    onKeyDown,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraftValue(e.target.value);
      setDirty(true);
    },
  };

  return (
    <Field className={`min-w-0 gap-1 ${className ?? ''}`}>
      <div className="flex h-4 items-center gap-1">
        <FieldLabel
          htmlFor={id}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
        </FieldLabel>
        <div className="ml-auto flex items-center gap-1">
          {low ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Low confidence, ${pct} percent`}
                  className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <TriangleAlert
                    aria-hidden="true"
                    className="size-4 text-warning"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {lowConfidenceTooltip(f.confidence)}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {mutation.isPending ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Spinner className="size-3" aria-hidden="true" />
              Saving…
            </span>
          ) : null}
          {edited ? (
            <>
              <Badge variant="secondary">Edited</Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Revert ${label.toLowerCase()} to Claude's read`}
                    onClick={revert}
                  >
                    <Undo2 aria-hidden="true" className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs break-words">
                  {revertTooltip(f.aiValue)}
                </TooltipContent>
              </Tooltip>
            </>
          ) : null}
        </div>
      </div>
      {multiline ? (
        <Textarea
          {...controlProps}
          rows={2}
          className={`min-h-[calc(2lh+1rem+2px)] max-h-[calc(6lh+1rem+2px)] overflow-y-auto break-words ${controlProps.className ?? ''}`}
        />
      ) : (
        <Input {...controlProps} />
      )}
      {latestRead !== null ? (
        <p className="flex min-w-0 items-start gap-1 text-xs text-muted-foreground">
          <Sparkles
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0 text-warning"
          />
          <span className="min-w-0 break-words">
            {`Latest scan reads \u201c${latestRead}\u201d`}{' '}
            <button
              type="button"
              className="rounded-sm text-foreground underline underline-offset-2 outline-none hover:text-foreground/80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => takeNewRead(latestRead)}
            >
              Use new read
            </button>
          </span>
        </p>
      ) : null}
      {low ? (
        <span id={hintId} className="sr-only">
          {`Low confidence, ${pct} percent. Check it against the crop.`}
        </span>
      ) : null}
      {error ? (
        <FieldError id={errorId} className="text-xs">
          {error}
        </FieldError>
      ) : null}
    </Field>
  );
}
