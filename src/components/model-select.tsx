'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveVisionModel } from '@/app/settings/actions';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ModelOption = { id: string; label: string };

/** Vision model picker; saves on change (D-08, D-18). */
export function ModelSelect({
  value,
  models,
}: {
  value: string;
  models: readonly ModelOption[];
}) {
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const res = await saveVisionModel(next);
      if (res.ok) {
        const label = models.find((m) => m.id === next)?.label ?? next;
        toast.success(`Vision model set to ${label}`);
        window.dispatchEvent(new Event('app:vision-model-changed'));
      } else {
        setCurrent(previous);
        setError(res.formError);
      }
    });
  }

  return (
    <Field data-disabled={pending ? true : undefined}>
      <FieldLabel htmlFor="vision-model">Vision model</FieldLabel>
      <Select value={current} onValueChange={onChange} disabled={pending}>
        <SelectTrigger
          id="vision-model"
          className="w-full max-w-full sm:w-fit"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'vision-model-error' : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {`${m.label} (${m.id})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        Opus reads small spine text best. Sonnet uses less of your plan.
      </FieldDescription>
      {error ? <FieldError id="vision-model-error">{error}</FieldError> : null}
    </Field>
  );
}
