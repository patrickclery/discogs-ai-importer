import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase 7 v2 (07-UI-SPEC Card treatments, THEME-08/09): dialogs, alert
// dialogs and the bulk bar sit on awesomer's featured surface. Radix content
// renders in a portal and the bulk bar needs the selection context, so these
// check the source, scoped to one function's region.

const read = (...p: string[]) =>
  fs.readFileSync(path.join(import.meta.dirname, ...p), 'utf8');

/** From `function name(` up to the next top-level `function `. */
function region(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

/** Every whole class token in the region's string literals. */
function tokens(code: string): string[] {
  const strings = code.match(/'[^'\n]*'|"[^"\n]*"/g) ?? [];
  return strings.flatMap((s) => s.slice(1, -1).split(/\s+/)).filter(Boolean);
}

const dialog = read('ui', 'dialog.tsx');
const alertDialog = read('ui', 'alert-dialog.tsx');

describe('dialog surfaces are featured (Phase 7 v2)', () => {
  for (const [file, src, name] of [
    ['dialog.tsx', dialog, 'DialogContent'],
    ['alert-dialog.tsx', alertDialog, 'AlertDialogContent'],
  ] as const) {
    it(`${file} ${name} uses card-featured and drops the plain panel`, () => {
      const t = tokens(region(src, name));
      expect(t).toEqual(
        expect.arrayContaining([
          'card-featured',
          'rounded-lg',
          'p-6',
          'z-50',
          'data-[state=open]:animate-in',
          'data-[state=closed]:animate-out',
          'data-[state=open]:zoom-in-95',
        ]),
      );
      for (const gone of ['bg-background', 'shadow-lg', 'border']) {
        expect(t).not.toContain(gone);
      }
    });
  }

  for (const [file, src, name] of [
    ['dialog.tsx', dialog, 'DialogDescription'],
    ['alert-dialog.tsx', alertDialog, 'AlertDialogDescription'],
  ] as const) {
    it(`${file} ${name} reads in Plex`, () => {
      expect(tokens(region(src, name))).toEqual(
        expect.arrayContaining([
          'font-prose',
          'text-sm',
          'text-muted-foreground',
        ]),
      );
    });
  }
});

describe('bulk import bar is featured (Phase 7 v2)', () => {
  it('the sticky wrapper is a rounded card-featured bar', () => {
    const src = read('bulk-import-bar.tsx');
    const sticky = (
      src.match(/"[^"\n]*sticky bottom-4 z-30[^"\n]*"/g) ?? []
    ).map((s) => s.slice(1, -1).split(/\s+/));
    expect(sticky).toHaveLength(1);
    const t = sticky[0];
    expect(t).toEqual(
      expect.arrayContaining(['rounded-xl', 'card-featured', 'px-4', 'py-2']),
    );
    for (const gone of ['bg-card', 'shadow-sm', 'border']) {
      expect(t).not.toContain(gone);
    }
  });
});
