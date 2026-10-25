'use client';

import { type KeyboardEvent, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { savePreferredCountry } from '@/app/settings/actions';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { UNREACHABLE_REASON } from '@/lib/failure-reason';

// Settings "Preferred country" (D-14; UI-SPEC "Settings: Preferred
// country"). Saves on blur and on Enter through savePreferredCountry (the
// demo build aliases that module), only when the trimmed value changed.
// The action answers Discogs' spelling, which the field then shows. The
// country is owner text rendered as React text only (T-06-09).

const INPUT_ID = 'preferred-country';
const ERROR_ID = 'preferred-country-error';
const EMPTY_COPY = 'Enter a country, such as Canada.';

/** skip: unchanged. empty: nothing to save. save: send the trimmed value. */
export function countrySaveDecision(
  draft: string,
  saved: string,
): 'skip' | 'empty' | 'save' {
  const t = draft.trim();
  if (t === saved) return 'skip';
  if (!t) return 'empty';
  return 'save';
}

/** The save-error sentence around the action's bare reason. */
export function countrySaveErrorText(reason: string): string {
  const clean = reason.slice(0, 160).replace(/[.\s]+$/, '');
  return `Not saved: ${clean}. Leave the field again to retry.`;
}

export function PreferredCountryField({
  initialCountry,
}: {
  initialCountry: string;
}) {
  const [value, setValue] = useState(initialCountry);
  const [saved, setSaved] = useState(initialCountry);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  // Enter then blur fire two commits before the first save answers.
  const inFlight = useRef(false);

  function commit() {
    if (inFlight.current) return;
    const decision = countrySaveDecision(value, saved);
    if (decision === 'skip') {
      setValue(saved);
      setError(null);
      return;
    }
    if (decision === 'empty') {
      setError(EMPTY_COPY);
      return;
    }
    const sent = value.trim();
    inFlight.current = true;
    setError(null);
    startSave(async () => {
      let res: Awaited<ReturnType<typeof savePreferredCountry>>;
      try {
        res = await savePreferredCountry(sent);
      } catch {
        res = { ok: false, formError: UNREACHABLE_REASON };
      }
      inFlight.current = false;
      if (res.ok) {
        const country = res.country;
        setSaved(country);
        // Keep anything typed since the save started.
        setValue((cur) => (cur.trim() === sent ? country : cur));
        toast.success(`Preferred country set to ${country}`);
      } else {
        // The typed value stays, so the next blur retries.
        setError(countrySaveErrorText(res.formError));
      }
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setValue(saved);
      setError(null);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={INPUT_ID}>Preferred country</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={INPUT_ID}
          className="w-64 max-w-full"
          value={value}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {saving ? <Spinner /> : null}
      </div>
      <FieldDescription>
        {
          "Bulk import picks this country's CD pressing of each top match. Write it the way Discogs does, such as Canada, US or UK."
        }
      </FieldDescription>
      {error ? <FieldError id={ERROR_ID}>{error}</FieldError> : null}
    </Field>
  );
}
