// The reason shown in inline dialog errors ("Couldn't …: {reason}."):
// the server's message (or error code) without its final period, else the
// status. Client-safe.
export async function failureReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown };
    const text =
      typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : '';
    if (text) return text.replace(/\.\s*$/, '');
  } catch {
    // Not JSON: fall through.
  }
  return `the server answered ${res.status}`;
}

/** The reason when fetch itself rejects (server down, network). */
export const UNREACHABLE_REASON = "the app couldn't reach the server";
