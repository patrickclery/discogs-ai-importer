import type * as Radix from 'radix-ui';
import { type ComponentProps, createElement, type ReactNode } from 'react';

/**
 * Radix mounts dialogs and Select lists through a Portal, which renders
 * nothing on the server, and they start closed. For renderToStaticMarkup
 * tests this renders the AlertDialog and Select portals inline and forces
 * both roots open, so the real primitives (and their real base classes)
 * reach the markup. Use it as a vi.mock factory:
 *
 *   vi.mock('radix-ui', async (orig) =>
 *     (await import('…/test/helpers/radix-open')).openRadixInline(await orig()),
 *   );
 */
export function openRadixInline(m: typeof Radix): typeof Radix {
  const Inline = (({ children }: { children?: ReactNode }) =>
    children) as never;
  const AlertDialogRoot = (p: ComponentProps<typeof m.AlertDialog.Root>) =>
    createElement(m.AlertDialog.Root, { ...p, open: true });
  const SelectRoot = (p: ComponentProps<typeof m.Select.Root>) =>
    createElement(m.Select.Root, { ...p, open: true });
  return {
    ...m,
    AlertDialog: { ...m.AlertDialog, Portal: Inline, Root: AlertDialogRoot },
    Select: { ...m.Select, Portal: Inline, Root: SelectRoot as never },
  };
}

/** One opening tag from static markup: its class tokens and attributes. */
export interface Tag {
  classes: string[];
  attr: (name: string) => string | undefined;
}

/** Every opening tag in `html` carrying `data-slot="{slot}"`. */
export function tagsWithSlot(html: string, slot: string): Tag[] {
  const tags = html.match(new RegExp(`<[^>]*data-slot="${slot}"[^>]*>`, 'g'));
  return (tags ?? []).map((tag) => {
    const attr = (name: string) =>
      tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
    return {
      classes: (attr('class') ?? '').split(/\s+/).filter(Boolean),
      attr,
    };
  });
}

/**
 * Tailwind utilities that set overflow-wrap or word-break. A wrapping
 * element must carry exactly one rule, or whichever Tailwind emits last
 * wins (G-04-7: `break-words` silently beat `[overflow-wrap:anywhere]`).
 */
export const OTHER_WRAP_UTILITIES = [
  'break-words',
  'wrap-break-word',
  'wrap-anywhere',
  'wrap-normal',
  'break-normal',
  'break-keep',
  'break-all',
] as const;
