/**
 * A decorative markdown prefix (`## ` or `> `) in mauve (07-UI-SPEC v2
 * Markdown prefixes). aria-hidden and select-none, so a heading's accessible
 * name and copied text are unchanged. It inherits the size and weight of its
 * heading or line.
 */
export function MdPrefix({ marker }: { marker: '##' | '>' }) {
  return (
    <span aria-hidden="true" className="select-none text-primary">
      {marker}{' '}
    </span>
  );
}
