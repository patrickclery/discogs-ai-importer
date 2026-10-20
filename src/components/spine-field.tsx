'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { SpineFieldDto, SpinesResponse } from '@/lib/scan-types';
import {
  isEdited,
  MAX_FIELD_CHARS,
  normalizeFieldInput,
  resolveDisplayedValue,
  withSpineField,
} from '@/lib/spine-review';

type PatchBody =
  | { field: SpineFieldDto['field']; value: string | null }
  | { field: SpineFieldDto['field']; revert: true };

async function patchField(
  spineId: string,
  body: PatchBody,
): Promise<SpineFieldDto> {
  const res = await fetch(`/api/spines/${encodeURIComponent(spineId)}/fields`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

/**
 * One editable spine field (REV-02, D-08..D-10). The input keeps a local
 * draft; while it is focused or holds unsaved text, polled data never changes
 * it (RESEARCH Pitfall 6). Leaving the field saves through PATCH
 * /api/spines/{id}/fields with an optimistic cache update.
 */
export function SpineField({
  spineId,
  field: f,
  label,
  className,
}: {
  spineId: string;
  field: SpineFieldDto;
  label: string;
  className?: string;
}) {
  const id = useId();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(f.value ?? '');
  const [focused, setFocused] = useState(false);
  const [dirty, setDirty] = useState(false);
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
      if (normalizeFieldInput(draftRef.current) === saved.value) {
        setDirty(false);
      }
    },
    onError: (_err, _body, ctx) => {
      // The cache goes back to the last saved state; the draft stays.
      for (const [key, data] of ctx?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['spines'] }),
  });

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

  function commit() {
    const next = normalizeFieldInput(draftRef.current);
    if (next === f.value) {
      setDirty(false);
      return;
    }
    mutation.mutate({ field: f.field, value: next });
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

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraftValue(f.value ?? '');
      setDirty(false);
      skipCommit.current = true;
      e.currentTarget.blur();
    }
  }

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
          {mutation.isPending ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Spinner className="size-3" aria-hidden="true" />
              Saving…
            </span>
          ) : null}
          {isEdited(f) ? <Badge variant="secondary">Edited</Badge> : null}
        </div>
      </div>
      <Input
        id={id}
        name={f.field}
        value={shown}
        maxLength={MAX_FIELD_CHARS}
        placeholder={f.aiValue === null ? 'Not read' : undefined}
        spellCheck={false}
        autoComplete="off"
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setDraftValue(e.target.value);
          setDirty(true);
        }}
      />
    </Field>
  );
}
