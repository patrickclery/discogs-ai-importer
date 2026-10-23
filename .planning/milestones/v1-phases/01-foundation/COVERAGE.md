# API Coverage — Phase 1 Foundation

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 1 integrates one external surface: the local Claude Code CLI (D-10, D-18), used only for detection, login status and a one-line headless test. The Anthropic HTTP API and the Discogs API are listed so their non-use is a recorded decision, not an omission.

## Claude Code CLI (headless, via `claude` on PATH or CLAUDE_BIN)

| capability | decision | reason |
|---|---|---|
| claude-cli: --version (install detection) | INTEGRATE | |
| claude-cli: auth status --json (login and auth method) | INTEGRATE | |
| claude-cli: -p with --output-format json (one-shot prompt) | INTEGRATE | |
| claude-cli: --model selection | INTEGRATE | |
| claude-cli: --no-session-persistence | INTEGRATE | |
| claude-cli: --strict-mcp-config (no MCP servers) | INTEGRATE | |
| claude-cli: --json-schema structured output | OPT-OUT | not needed yet: Phase 2 vision call (VIS-01, VIS-02) |
| claude-cli: --allowedTools Read with an image path | OPT-OUT | not needed yet: Phase 2 vision call reads the pre-resized photo (INGEST-05, VIS-01) |
| claude-cli: --output-format stream-json and partial messages | OPT-OUT | not needed: one JSON result per call is enough for a background job |
| claude-cli: auth login and logout | OPT-OUT | interactive; the owner runs claude auth login in a terminal, the app only reports status |
| claude-cli: setup-token | OPT-OUT | not needed: subscription login is already handled by the CLI |
| claude-cli: --resume, --session-id and background sessions | OPT-OUT | explicitly out of scope: every call is stateless and unsaved |
| claude-cli: minimal mode (bare) | OPT-OUT | explicitly forbidden: it authenticates only with an API key, which would bill the API (D-18) |
| claude-cli: --max-budget-usd | OPT-OUT | not applicable: subscription usage, not API spend |
| claude-cli: mcp, plugins, agents, hooks configuration | OPT-OUT | explicitly out of scope: the app never changes the owner's Claude Code setup |

## Anthropic HTTP API / @anthropic-ai/sdk

| capability | decision | reason |
|---|---|---|
| anthropic-api: messages and messages.parse | OPT-OUT | explicitly out of scope: no API key and no API billing, vision goes through the CLI (D-18) |
| anthropic-api: models.list key test | OPT-OUT | replaced by Test Claude through the CLI (D-10 as amended by D-18) |
| anthropic-api: count_tokens, batches, files | OPT-OUT | explicitly out of scope: the SDK is not a dependency (D-18) |

## Discogs API

| capability | decision | reason |
|---|---|---|
| discogs: OAuth 1.0a request, authorize, access token | OPT-OUT | not needed yet: Phase 3 (DISC-01); Phase 1 only stores consumer key and secret |
| discogs: identity and connection test | OPT-OUT | not needed yet: Phase 3 per CONTEXT.md deferred ideas |
| discogs: database search and releases | OPT-OUT | not needed yet: Phase 3 (DISC-03 to DISC-06) |
| discogs: collection folders and add release | OPT-OUT | not needed yet: Phase 4 (IMP-01 to IMP-04) |
