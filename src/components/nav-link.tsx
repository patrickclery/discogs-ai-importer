'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Header nav link. Active by path prefix; the 2px accent bar is positioned
 * against the parent <li>, which spans the full header height.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'inline-flex h-9 items-center rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
          active
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
      </Link>
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary"
        />
      ) : null}
    </>
  );
}
