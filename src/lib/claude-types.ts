// Client-safe Claude values and types (Phase 5, D-12). No server-only or Node
// imports: the Claude CLI card renders from these inside the client demo
// Settings page. src/server/claude/cli.ts and src/server/settings.ts
// re-export every name, so server imports are unchanged.

// Haiku is excluded: its 1568 px image cap makes spine text illegible.
export const VISION_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
] as const;
export type VisionModelId = (typeof VISION_MODELS)[number]['id'];

export type ClaudeAuthState =
  | 'subscription'
  | 'other'
  | 'logged-out'
  | 'unknown';

export type ClaudeCliStatus = {
  installed: boolean;
  version: string | null;
  auth: {
    state: ClaudeAuthState;
    authMethod: string | null;
    subscriptionType: string | null;
    reason: string | null;
  };
  /** True when any API_BILLING_ENV variable is set server-side. */
  apiKeyInEnv: boolean;
  /** Which of them (names only). */
  apiBillingEnv: string[];
  checkedAt: number;
};

/**
 * Installed and logged in with a Claude subscription. Any other login (API
 * key, console) would bill the API, which D-18 rules out (WR-06).
 */
export function isClaudeReady(s: ClaudeCliStatus): boolean {
  return s.installed && s.auth.state === 'subscription';
}

export type TestResult =
  | { ok: true; model: string; message: string }
  | {
      ok: false;
      kind:
        | 'not-installed'
        | 'not-logged-in'
        | 'not-subscription'
        | 'timeout'
        | 'failed';
      message: string;
    };
