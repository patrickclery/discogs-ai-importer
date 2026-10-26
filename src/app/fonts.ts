import { Geist_Mono, IBM_Plex_Sans } from 'next/font/google';
import localFont from 'next/font/local';

// awesomer's fonts (07-UI-SPEC v2): Geist Mono is the UI font, IBM Plex Sans
// is for prose only, and asciiMono draws the block wordmark.
export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const plexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: '400',
});

// A 7 KB subset of Noto Sans Mono (SIL OFL 1.1) captured from awesomer:
// U+0020-007E, U+00A0 and U+2500-259F (box drawing and block elements).
export const asciiMono = localFont({
  src: './fonts/ascii_mono.woff2',
  variable: '--font-ascii-mono',
  display: 'block',
});
