#!/usr/bin/env node
// Stand-in for the Claude Code CLI, used by unit tests and verify-claude-cli.
// Never contacts anything. Behavior is chosen by FAKE_CLAUDE_MODE:
//   ok (default) | logged-out | api-key | status-hang | login-error | error |
//   hang | bad-json | vision | vision-refused | vision-max-turns |
//   vision-invalid | vision-retries
// vision: requires --json-schema, --effort and exactly one --add-dir holding
// image.jpg whose absolute path is in the -p prompt, then prints a success
// envelope whose structured_output is the JSON file named by
// FAKE_CLAUDE_VISION_FIXTURE. Any missing piece exits 2 with the reason.
// The vision-* failure modes run the same argv checks, then answer with:
//   vision-refused    success, a prose result and no structured_output
//   vision-max-turns  is_error, subtype error_max_turns, exit 1
//   vision-invalid    success with structured_output { spines: 'nope' }
//   vision-retries    is_error, subtype error_max_structured_output_retries
// FAKE_CLAUDE_STDERR, when set, is written to stderr by every -p call.
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

function visionEnvelope(model, fields) {
  return {
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
    ...fields,
  };
}

function visionCall(model, variant) {
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
  if (variant === 'vision-refused') {
    print(
      visionEnvelope(model, {
        result: "I'm not able to help with reading this image.",
      }),
    );
    process.exit(0);
  }
  if (variant === 'vision-max-turns') {
    print(
      visionEnvelope(model, {
        subtype: 'error_max_turns',
        is_error: true,
        num_turns: 6,
      }),
    );
    process.exit(1);
  }
  if (variant === 'vision-invalid') {
    print(visionEnvelope(model, { structured_output: { spines: 'nope' } }));
    process.exit(0);
  }
  if (variant === 'vision-retries') {
    print(
      visionEnvelope(model, {
        subtype: 'error_max_structured_output_retries',
        is_error: true,
      }),
    );
    process.exit(1);
  }
  const fixture = process.env.FAKE_CLAUDE_VISION_FIXTURE;
  if (!fixture) refuse('FAKE_CLAUDE_VISION_FIXTURE is not set');
  const structured = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  // Write and exit only once stdout has drained (large fixtures).
  process.stdout.write(
    `${JSON.stringify(visionEnvelope(model, { structured_output: structured }))}\n`,
    () => process.exit(0),
  );
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
  if (process.env.FAKE_CLAUDE_STDERR) {
    process.stderr.write(`${process.env.FAKE_CLAUDE_STDERR}\n`);
  }
  if (mode === 'hang') {
    hang();
  } else if (mode === 'vision' || mode.startsWith('vision-')) {
    visionCall(model, mode);
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
