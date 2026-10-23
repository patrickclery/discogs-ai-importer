import { redirect } from 'next/navigation';

// Demo root (D-02): like the real root page, the base URL lands on Upload.
// In the static export this is a client-side redirect under the basePath
// (RESEARCH "Root page (proven)").
export default function DemoHome() {
  redirect('/upload');
}
