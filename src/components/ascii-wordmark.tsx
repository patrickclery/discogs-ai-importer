// The app name in the ANSI Shadow figlet style, drawn in the asciiMono subset
// (Noto Sans Mono: U+0020-007E, U+00A0, U+2500-259F) per 07-UI-SPEC v2.
// Kept as single-quoted literals so line 7's trailing space survives formatters.
export const WORDMARK = [
  '██████╗ ██╗███████╗ ██████╗ ██████╗  ██████╗ ███████╗',
  '██╔══██╗██║██╔════╝██╔════╝██╔═══██╗██╔════╝ ██╔════╝',
  '██║  ██║██║███████╗██║     ██║   ██║██║  ███╗███████╗',
  '██║  ██║██║╚════██║██║     ██║   ██║██║   ██║╚════██║',
  '██████╔╝██║███████║╚██████╗╚██████╔╝╚██████╔╝███████║',
  '╚═════╝ ╚═╝╚══════╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝',
  ' █████╗ ██╗    ██╗███╗   ███╗██████╗  ██████╗ ██████╗ ████████╗███████╗██████╗ ',
  '██╔══██╗██║    ██║████╗ ████║██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝██╔══██╗',
  '███████║██║    ██║██╔████╔██║██████╔╝██║   ██║██████╔╝   ██║   █████╗  ██████╔╝',
  '██╔══██║██║    ██║██║╚██╔╝██║██╔═══╝ ██║   ██║██╔══██╗   ██║   ██╔══╝  ██╔══██╗',
  '██║  ██║██║    ██║██║ ╚═╝ ██║██║     ╚██████╔╝██║  ██║   ██║   ███████╗██║  ██║',
  '╚═╝  ╚═╝╚═╝    ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝',
].join('\n');

/** Decorative /upload wordmark, hidden below 640px and from screen readers. */
export function AsciiWordmark() {
  return (
    <div aria-hidden="true" className="hidden overflow-hidden pb-2 sm:block">
      <pre className="ascii-art glow text-primary">{WORDMARK}</pre>
    </div>
  );
}
