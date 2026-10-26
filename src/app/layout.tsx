import type { Metadata, Viewport } from 'next';
import { AppHeader } from '@/components/app-header';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { asciiMono, geistMono, plexSans } from './fonts';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Discogs AI Importer',
  description: 'Turn photos of disc shelves into Discogs collection entries.',
};

export const viewport: Viewport = { colorScheme: 'dark' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${geistMono.variable} ${plexSans.variable} ${asciiMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <Providers>
              <AppHeader />
              <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
            </Providers>
            <Toaster position="bottom-right" richColors={false} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
