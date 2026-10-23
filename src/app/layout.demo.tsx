import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DemoRoot } from '@/demo/demo-root';
import { Providers } from './providers';
import './globals.css';

// Demo build only (NEXT_PUBLIC_DEMO=1, D-02): the real layout's tree with
// DemoRoot around Providers, so the fetch shim is installed before the first
// /api call and the banner shows on every page (D-05, D-15).

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Discogs AI Importer — demo',
  description: 'Turn photos of disc shelves into Discogs collection entries.',
};

export default function DemoRootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <DemoRoot>
              <Providers>
                <AppHeader />
                <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
              </Providers>
            </DemoRoot>
            <Toaster position="bottom-right" richColors={false} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
