import { Disc3 } from 'lucide-react';
import Link from 'next/link';
import { NavLink } from '@/components/nav-link';
import { StatusIndicator } from '@/components/status-indicator';

const NAV = [
  { href: '/upload', label: 'Upload' },
  { href: '/spines', label: 'Spines' },
  { href: '/settings', label: 'Settings' },
] as const;

const REPO_URL = 'https://github.com/patrickclery/discogs-ai-importer';

/** The GitHub mark, inline: lucide-react no longer ships brand icons. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

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
        <div className="ml-auto flex items-center gap-2">
          <StatusIndicator />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <GitHubMark className="size-5" />
          </a>
        </div>
      </div>
    </header>
  );
}
