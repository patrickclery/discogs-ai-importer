import { cn } from '@/lib/utils';

/**
 * awesomer's faint corner number (07-UI-SPEC v2 Corner numerals). Decorative:
 * hidden from assistive tech, unselectable and click-through. The parent must
 * be `relative isolate overflow-hidden` (Card mini and featured are), so the
 * `-z-10` numeral sits above the card's fill but below all content.
 */
const SIZES = {
  sm: '-right-1 -bottom-2 text-4xl', // awesomer card-tiny
  md: '-right-1 -bottom-3 text-7xl', // awesomer card-mini
  lg: '-right-2 -bottom-6 text-[10rem]', // awesomer card-featured
} as const;

export function CornerNumeral({
  value,
  size,
}: {
  value: number;
  size: keyof typeof SIZES;
}) {
  return (
    <span
      aria-hidden="true"
      data-corner-numeral=""
      className={cn(
        'pointer-events-none absolute -z-10 select-none font-mono font-black leading-none text-primary/[0.07]',
        SIZES[size],
      )}
    >
      {value}
    </span>
  );
}
