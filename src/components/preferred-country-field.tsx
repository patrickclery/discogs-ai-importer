'use client';

import { type KeyboardEvent, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  saveFallbackCountry,
  savePreferredCountry,
} from '@/app/settings/actions';
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
// country") and "Fallback country" (G-06-side-1). Each saves on blur and on
// Enter through its action (the demo build aliases that module), only when
// the trimmed value changed. The action answers Discogs' spelling, which the
// field then shows. The country is owner text rendered as React text only
// (T-06-09, T-06-28).

/** The error each field shows when left empty. */
export const COUNTRY_EMPTY_COPY = {
  preferred: 'Enter a country, such as Canada.',
  fallback: 'Enter a country, such as US.',
} as const;

type CountrySave = typeof savePreferredCountry;

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

function CountrySettingField({
  inputId,
  errorId,
  label,
  description,
  emptyCopy,
  savedToast,
  initialCountry,
  save,
}: {
  inputId: string;
  errorId: string;
  label: string;
  description: string;
  emptyCopy: string;
  savedToast: (country: string) => string;
  initialCountry: string;
  save: CountrySave;
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
      setError(emptyCopy);
      return;
    }
    const sent = value.trim();
    inFlight.current = true;
    setError(null);
    startSave(async () => {
      let res: Awaited<ReturnType<CountrySave>>;
      try {
        res = await save(sent);
      } catch {
        res = { ok: false, formError: UNREACHABLE_REASON };
      }
      inFlight.current = false;
      if (res.ok) {
        const country = res.country;
        setSaved(country);
        // Keep anything typed since the save started.
        setValue((cur) => (cur.trim() === sent ? country : cur));
        toast.success(savedToast(country));
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
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          className="w-64 max-w-full"
          value={value}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {saving ? <Spinner /> : null}
      </div>
      <FieldDescription>{description}</FieldDescription>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}

export function PreferredCountryField({
  initialCountry,
}: {
  initialCountry: string;
}) {
  return (
    <CountrySettingField
      inputId="preferred-country"
      errorId="preferred-country-error"
      label="Preferred country"
      description={
        "Bulk import picks this country's CD pressing of each top match. Write it the way Discogs does, such as Canada, US or UK."
      }
      emptyCopy={COUNTRY_EMPTY_COPY.preferred}
      savedToast={(country) => `Preferred country set to ${country}`}
      initialCountry={initialCountry}
      save={savePreferredCountry}
    />
  );
}

export function FallbackCountryField({
  initialCountry,
}: {
  initialCountry: string;
}) {
  return (
    <CountrySettingField
      inputId="fallback-country"
      errorId="fallback-country-error"
      label="Fallback country"
      description={
        "If Discogs lists no pressing from the preferred country, bulk import picks this country's CD pressing next, or else keeps the top match. Write it the way Discogs does, such as US, UK or Germany."
      }
      emptyCopy={COUNTRY_EMPTY_COPY.fallback}
      savedToast={(country) => `Fallback country set to ${country}`}
      initialCountry={initialCountry}
      save={saveFallbackCountry}
    />
  );
}
