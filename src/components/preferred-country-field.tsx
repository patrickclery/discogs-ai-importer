'use client';

export function countrySaveDecision(
  _draft: string,
  _saved: string,
): 'skip' | 'empty' | 'save' {
  return 'save';
}

export function countrySaveErrorText(reason: string): string {
  return reason;
}

export function PreferredCountryField({
  initialCountry,
}: {
  initialCountry: string;
}) {
  return <div data-country={initialCountry} />;
}
