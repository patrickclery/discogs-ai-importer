#!/usr/bin/env node
// Stand-in for the Claude Code CLI, used by unit tests and verify-claude-cli.
// Never contacts anything. Behavior is chosen by FAKE_CLAUDE_MODE:
//   ok (default) | logged-out | api-key | status-hang | login-error | error |
//   hang | bad-json | vision
// vision: requires --json-schema, --effort and exactly one --add-dir holding
// image.jpg whose absolute path is in the -p prompt, then prints a success
// envelope whose structured_output is the JSON file named by
// FAKE_CLAUDE_VISION_FIXTURE. Any missing piece exits 2 with the reason.
// When FAKE_CLAUDE_LOG is set, one JSON line per invocation is appended to
// that file recording argv, cwd, pid and which sensitive variables the
// process received (presence only, never values).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE || 'ok';

if (process.env.FAKE_CLAUDE_LOG) {
  const entry = {
    argv: args,
    cwd: process.cwd(),
    pid: process.pid,
    env: {
      ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY' in process.env,
      ANTHROPIC_AUTH_TOKEN: 'ANTHROPIC_AUTH_TOKEN' in process.env,
      DISCOGS_CONSUMER_KEY: 'DISCOGS_CONSUMER_KEY' in process.env,
      DISCOGS_CONSUMER_SECRET: 'DISCOGS_CONSUMER_SECRET' in process.env,
      ANTHROPIC_BASE_URL: 'ANTHROPIC_BASE_URL' in process.env,
      CLAUDE_CODE_USE_BEDROCK: 'CLAUDE_CODE_USE_BEDROCK' in process.env,
      CLAUDE_CODE_USE_VERTEX: 'CLAUDE_CODE_USE_VERTEX' in process.env,
      CLAUDE_EFFORT: 'CLAUDE_EFFORT' in process.env,
      CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING:
        'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING' in process.env,
    },
  };
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify(entry)}\n`);
}

function hang() {
  setInterval(() => {}, 1000);
}

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function resultJson({ isError, result, model }) {
  return {
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    is_error: isError,
    duration_ms: 1234,
    num_turns: 1,
    result,
    session_id: '00000000-0000-0000-0000-000000000000',
    total_cost_usd: 0.0123,
    usage: { input_tokens: 10, output_tokens: 2 },
    modelUsage: isError
      ? {}
      : { [model]: { inputTokens: 10, outputTokens: 2, costUSD: 0.0123 } },
  };
}

function refuse(reason) {
  process.stderr.write(`fake-claude vision: ${reason}\n`);
  process.exit(2);
}

function visionCall(model) {
  if (flag('--json-schema') === undefined) refuse('missing --json-schema');
  if (flag('--effort') === undefined) refuse('missing --effort');
  const dirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []));
  if (dirs.length !== 1) refuse(`expected one --add-dir, got ${dirs.length}`);
  const image = path.join(dirs[0], 'image.jpg');
  if (!fs.existsSync(dirs[0])) refuse(`--add-dir ${dirs[0]} does not exist`);
  if (!fs.existsSync(image)) refuse(`no image.jpg in ${dirs[0]}`);
  if (!(flag('-p') || '').includes(image)) {
    refuse(`the prompt does not name ${image}`);
  }
  const fixture = process.env.FAKE_CLAUDE_VISION_FIXTURE;
  if (!fixture) refuse('FAKE_CLAUDE_VISION_FIXTURE is not set');
  const structured = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  print({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 2345,
    num_turns: 2,
    result: '',
    session_id: '00000000-0000-0000-0000-000000000000',
    total_cost_usd: 0.0456,
    usage: { input_tokens: 2000, output_tokens: 800 },
    modelUsage: {
      [model]: { inputTokens: 2000, outputTokens: 800, costUSD: 0.0456 },
    },
    structured_output: structured,
  });
  process.exit(0);
}

if (args[0] === '--version') {
  process.stdout.write('9.9.9 (Claude Code)\n');
  process.exit(0);
}

if (args[0] === 'auth' && args[1] === 'status') {
  if (mode === 'status-hang') {
    hang();
  } else {
    print({
      loggedIn: mode !== 'logged-out',
      authMethod:
        mode === 'logged-out'
          ? 'none'
          : mode === 'api-key'
            ? 'api_key'
            : 'claude.ai',
      apiProvider: 'firstParty',
      email: 'fake-owner@example.invalid',
      orgId: 'fake-org-0000',
      orgName: 'Fake Org Name',
      subscriptionType:
        mode === 'api-key' || mode === 'logged-out' ? null : 'max',
    });
    process.exit(mode === 'logged-out' ? 1 : 0);
  }
} else if (args[0] === '-p') {
  const model = flag('--model') || 'claude-opus-5-5';
  if (mode === 'hang') {
    hang();
  } else if (mode === 'vision') {
    visionCall(model);
  } else if (mode === 'bad-json') {
    process.stdout.write('not json\n');
    process.exit(0);
  } else if (mode === 'login-error') {
    print(
      resultJson({
        isError: true,
        result: 'Not logged in · Please run /login',
      }),
    );
    process.exit(1);
  } else if (mode === 'error') {
    print(
      resultJson({
        isError: true,
        result: process.env.FAKE_CLAUDE_ERROR_TEXT || 'Overloaded',
      }),
    );
    process.exit(1);
  } else {
    print(resultJson({ isError: false, result: 'OK', model }));
    process.exit(0);
  }
} else {
  process.stderr.write(
    `fake-claude: unsupported arguments ${args.join(' ')}\n`,
  );
  process.exit(2);
}
