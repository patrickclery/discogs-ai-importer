'use client';

// Must stay a rendered client component: importing the shim from the server
// layout never reaches the browser bundle (RESEARCH Pitfall 3).
import './fetch-shim';
import type { ReactNode } from 'react';

export const DEMO_BANNER_TEXT =
  'Demo — Claude and Discogs are simulated. Changes reset when you reload.';

/** Installs the fetch shim and shows the demo banner on every page (D-05). */
export function DemoRoot({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        role="note"
        className="border-b bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground"
      >
        {DEMO_BANNER_TEXT}
      </div>
      {children}
    </>
  );
}
