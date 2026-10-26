import { Disc3 } from 'lucide-react';
import Link from 'next/link';
import { NavLink } from '@/components/nav-link';
import { StatusIndicator } from '@/components/status-indicator';

const NAV = [
  { href: '/upload', label: 'Upload' },
  { href: '/spines', label: 'Spines' },
  { href: '/settings', label: 'Settings' },
] as const;

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-full max-w-6xl items-center px-4 sm:px-6">
        <Link
          href="/upload"
          aria-label="Discogs AI Importer"
          className="flex h-9 shrink-0 items-center gap-2 rounded-md text-base font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Disc3 aria-hidden="true" className="size-5" />
          <span className="glow-intense hidden lg:inline">
            Discogs AI Importer
            <span aria-hidden="true" className="cursor-blink">
              _
            </span>
          </span>
        </Link>
        <nav aria-label="Main" className="ml-4 h-full sm:ml-6">
          <ul className="flex h-full items-center gap-2">
            {NAV.map((item) => (
              <li key={item.href} className="relative flex h-full items-center">
                <NavLink href={item.href} label={item.label} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center">
          <StatusIndicator />
        </div>
      </div>
    </header>
  );
}
