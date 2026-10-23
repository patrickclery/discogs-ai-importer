'use client';

import ErrorPage from './error';

// Demo error boundary (D-02): the app's own error screen, same props.
export default function DemoErrorPage(props: {
  error: unknown;
  reset: () => void;
  retry?: () => void;
}) {
  return <ErrorPage {...props} />;
}
