// Tests for 'vf test run create-suite --wait' (internal/cli/test/run/
// createsuite_wait.go): one command starts a suite, waits until every run has
// finished, and exits non-zero unless every run passed. Uses a local mock API.
//
// The command is hooked in by one line in the generated createsuite.go, so
// these tests are what notice a regeneration that drops it.
//
// Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

// Mirrors the list in internal/output/agentmode.go, so a stray one on the host
// does not flip the renderer.
const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

const BULK_ID = 'bulk-1';
const SUITE_FLAGS = ['test', 'run', 'create-suite', '--project-id', 'p1', '--environment-alias', 'main'];

type Counts = { total: number; passed: number; failed: number; canceled: number; unfinished: number };
type Reply = { status: number; body: object | null; delayMs?: number };

// A reply status that makes the mock send headers and half a body, then drop
// the connection.
const TRUNCATE = -1;

// Parses a stream of JSON values written one after another, failing on any
// text between them.
function jsonStream(text: string): any[] {
  const values: any[] = [];
  let rest = text.trim();
  while (rest) {
    let end = 0;
    let depth = 0;
    let inString = false;
    for (let i = 0; i < rest.length; i += 1) {
      const char = rest[i];
      if (inString) {
        if (char === '\\') i += 1;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    expect(end, `stderr is not only JSON:\n${text}`).toBeGreaterThan(0);
    values.push(JSON.parse(rest.slice(0, end)));
    rest = rest.slice(end).trim();
  }
  return values;
}

const run = (runID: string, status: string) => ({
  runID,
  testID: `test-${runID}`,
  status,
  passedChecks: status === 'failed' ? 0 : null,
  totalChecks: 1,
  failReason: null,
  failedChecks: status === 'failed' ? [{ checkID: 'c1', type: 'llm', reason: 'Did not greet the user' }] : [],
});

const waitReply = (counts: Counts, runs: object[] = []): Reply => ({
  status: 200,
  body: {
    bulkID: BULK_ID,
    done: counts.unfinished === 0,
    stoppedBy: counts.unfinished === 0 ? 'finished' : 'timeout',
    waitedSeconds: 1,
    counts,
    runs,
  },
});

let server: http.Server;
let serverURL: string;
let createReply: object | null;
let waitReplies: Reply[];
let requests: Array<{ path: string; body: any }>;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const pathname = new URL(req.url ?? '/', 'http://mock').pathname;
      requests.push({ path: pathname, body: raw ? JSON.parse(raw) : undefined });

      const reply = (status: number, body: object | null) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (pathname.endsWith('/test-run/suite')) {
        return reply(201, createReply);
      }
      if (pathname.endsWith('/test-run/suite/wait')) {
        const next = waitReplies.length > 1 ? waitReplies.shift()! : waitReplies[0]!;
        if (next.status === TRUNCATE) {
          res.writeHead(200, { 'content-type': 'application/json', 'content-length': '1000' });
          res.write('{"bulkID":');
          return res.socket?.destroy();
        }
        return setTimeout(() => reply(next.status, next.body), next.delayMs ?? 0);
      }
      return reply(404, { statusCode: 404, message: 'Not found' });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  createReply = {
    bulkID: BULK_ID,
    runs: [
      { id: 'r1', testID: 'test-r1', status: 'idle' },
      { id: 'r2', testID: 'test-r2', status: 'idle' },
    ],
  };
  waitReplies = [];
});

function vf(args: string[], opts: { agentMode?: boolean } = {}) {
  const env: Record<string, string | undefined> = Object.fromEntries(AGENT_ENV_VARS.map((name) => [name, undefined]));
  if (opts.agentMode) env.CLAUDECODE = '1';
  return execa({ reject: false, timeout: 25_000, stdin: 'ignore', env, extendEnv: true })(VF, [
    ...args,
    '--token', 'vfp_x',
    '--server-url', serverURL,
    '--output-format', 'json',
  ]);
}

const waits = () => requests.filter((request) => request.path.endsWith('/suite/wait'));

// The flags a follow-up command needs to reach the suite, --server-url
// included since vf() passes one.
const target = () => `--project-id p1 --environment-alias main --server-url ${serverURL}`;

describe('create-suite --wait', () => {
  it('waits until every run has finished and exits 0 when they all passed', async () => {
    waitReplies = [
      waitReply({ total: 2, passed: 1, failed: 0, canceled: 0, unfinished: 1 }, [run('r2', 'running')]),
      waitReply({ total: 2, passed: 2, failed: 0, canceled: 0, unfinished: 0 }),
    ];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait']);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ bulkID: BULK_ID, done: true, counts: { passed: 2 } });
    expect(result.stderr).toContain(`Started suite ${BULK_ID} with 2 runs`);
    expect(result.stderr).toContain(`keep waiting with: vf test run wait-suite ${target()} --bulk-id ${BULK_ID}`);
    expect(result.stderr).toContain('1 of 2 passed, 1 still going');
    expect(waits()).toHaveLength(2);
    expect(waits()[0]!.body).toEqual({ bulkID: BULK_ID, timeoutSeconds: 45 });
  });

  it('exits 1 when a run failed, after printing the failed checks', async () => {
    waitReplies = [waitReply({ total: 2, passed: 1, failed: 1, canceled: 0, unfinished: 0 }, [run('r1', 'failed')])];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).runs[0].failedChecks[0].reason).toBe('Did not greet the user');
    expect(result.stderr).toContain(`1 of 2 runs in suite ${BULK_ID} did not pass (1 failed, 0 canceled)`);
    expect(result.stderr).toContain(`vf test run get ${target()} --run-id <id>`);
  });

  it('writes nothing but JSON to stderr in agent mode: progress events, then the error envelope', async () => {
    waitReplies = [
      waitReply({ total: 2, passed: 1, failed: 0, canceled: 0, unfinished: 1 }, [run('r2', 'running')]),
      waitReply({ total: 2, passed: 1, failed: 0, canceled: 1, unfinished: 0 }, [run('r2', 'canceled')]),
    ];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait'], { agentMode: true });

    expect(result.exitCode).toBe(1);
    const events = jsonStream(result.stderr);
    expect(events.map((event) => event.status ?? event.error_type)).toEqual(['started', 'waiting', 'test_suite_failed']);
    expect(events[0]).toMatchObject({ bulkID: BULK_ID, runs: 2 });
    expect(events[1]).toMatchObject({ counts: { passed: 1, unfinished: 1 } });
    expect(events[2]!.message).toContain('did not pass (0 failed, 1 canceled)');
  });

  it('exits 1 with the command to keep waiting when --max-wait runs out first', async () => {
    waitReplies = [waitReply({ total: 2, passed: 0, failed: 0, canceled: 0, unfinished: 2 }, [run('r1', 'running')])];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait', '--max-wait', '3s']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ done: false, counts: { unfinished: 2 } });
    expect(result.stderr).toContain(`2 of 2 runs in suite ${BULK_ID} were still going after 3s`);
    expect(result.stderr).toContain(`vf test run wait-suite ${target()} --bulk-id ${BULK_ID}`);
    expect(waits()[0]!.body.timeoutSeconds).toBe(5);
  });

  it('retries a wait that hit a server error', async () => {
    waitReplies = [
      { status: 502, body: { statusCode: 502, message: 'Bad gateway' } },
      waitReply({ total: 2, passed: 2, failed: 0, canceled: 0, unfinished: 0 }),
    ];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait']);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain('Retrying in 5s');
    expect(waits()).toHaveLength(2);
  });

  it('retries a wait whose answer was cut off mid-body', async () => {
    waitReplies = [
      { status: TRUNCATE, body: {} },
      waitReply({ total: 2, passed: 2, failed: 0, canceled: 0, unfinished: 0 }),
    ];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait']);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain('Retrying in 5s');
    expect(waits()).toHaveLength(2);
  });

  it('refuses a --timeout no wait fits in, before starting the suite', async () => {
    const result = await vf([...SUITE_FLAGS, '--all', '--wait', '--timeout', '3s']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--wait needs a --timeout of at least 10s');
    expect(requests).toHaveLength(0);
  });

  it('refuses --max-wait without --wait', async () => {
    const result = await vf([...SUITE_FLAGS, '--all', '--max-wait', '5m']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--max-wait only applies with --wait');
    expect(requests).toHaveLength(0);
  });

  it('stops with the agent-mode envelope on a wait answer that decodes to nothing, instead of polling it', async () => {
    for (const body of [null, {}]) {
      requests = [];
      waitReplies = [{ status: 200, body }];

      const result = await vf([...SUITE_FLAGS, '--all', '--wait'], { agentMode: true });

      expect(result.exitCode).toBe(1);
      expect(waits()).toHaveLength(1);
      const events = jsonStream(result.stderr);
      expect(events.map((event) => event.status ?? event.error_type)).toEqual(['started', 'test_suite_wait_failed']);
      expect(events[1]!.message).toContain(`stopped waiting for suite ${BULK_ID}: the API returned no result`);
      expect(JSON.stringify(events[1]!.hints)).toContain(`vf test run wait-suite ${target()} --bulk-id ${BULK_ID}`);
    }
  });

  it('keeps an API error structured, and says how to keep waiting rather than rerun, when a wait fails', async () => {
    for (const [status, errorType] of [
      [401, 'authentication_error'],
      [404, 'not_found'],
    ] as const) {
      requests = [];
      waitReplies = [{ status, body: { statusCode: status, message: 'Nope' } }];

      const result = await vf([...SUITE_FLAGS, '--all', '--wait'], { agentMode: true });

      expect(result.exitCode).toBe(1);
      expect(waits()).toHaveLength(1);
      const events = jsonStream(result.stderr);
      expect(events.map((event) => event.status ?? event.error_type)).toEqual(['started', errorType]);
      expect(events[1]).toMatchObject({ status_code: status, bulkID: BULK_ID });
      expect(events[1]!.hints.at(-1)).toContain(`keep waiting with: vf test run wait-suite ${target()} --bulk-id ${BULK_ID}`);
      expect(JSON.stringify(events[1]!.hints)).not.toContain('retry the command');
    }
  });

  it('says how to keep waiting after an API error outside agent mode too', async () => {
    waitReplies = [{ status: 404, body: { statusCode: 404, message: 'Nope' } }];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('404');
    expect(result.stderr).toContain(`keep waiting with: vf test run wait-suite ${target()} --bulk-id ${BULK_ID}`);
  });

  it('says how to keep waiting, not to rerun, when a server error outlasts the retries', async () => {
    waitReplies = [{ status: 503, body: { statusCode: 503, message: 'Unavailable' } }];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait'], { agentMode: true });

    expect(result.exitCode).toBe(1);
    expect(waits()).toHaveLength(4);
    const events = jsonStream(result.stderr);
    expect(events.map((event) => event.status ?? event.error_type)).toEqual([
      'started', 'retrying', 'retrying', 'retrying', 'test_suite_wait_failed',
    ]);
    expect(JSON.stringify(events.at(-1)!.hints)).toContain(`vf test run wait-suite ${target()} --bulk-id ${BULK_ID}`);
    expect(JSON.stringify(events.at(-1)!.hints)).not.toContain('retry the command');
  }, 30_000);

  it('reports the last answer as unfinished when a wait fails after --max-wait ran out', async () => {
    waitReplies = [
      waitReply({ total: 2, passed: 0, failed: 0, canceled: 0, unfinished: 2 }, [run('r1', 'running')]),
      { status: 502, body: { statusCode: 502, message: 'Bad gateway' }, delayMs: 3500 },
    ];

    const result = await vf([...SUITE_FLAGS, '--all', '--wait', '--max-wait', '4s']);

    expect(result.exitCode).toBe(1);
    expect(waits()).toHaveLength(2);
    expect(result.stderr).not.toContain('Retrying');
    expect(JSON.parse(result.stdout)).toMatchObject({ done: false, counts: { unfinished: 2 } });
    expect(result.stderr).toContain(`were still going after 4s`);
  });

  it('does not wait on a started suite whose answer has no bulkID', async () => {
    createReply = { runs: [] };

    const result = await vf([...SUITE_FLAGS, '--all', '--wait'], { agentMode: true });

    expect(result.exitCode).toBe(1);
    expect(waits()).toHaveLength(0);
    const events = jsonStream(result.stderr);
    expect(events.map((event) => event.error_type)).toEqual(['test_suite_wait_failed']);
    expect(JSON.stringify(events[0]!.hints)).toContain(`vf test run search ${target()}`);
  });

  it('refuses a --jq that cannot run before starting the suite, not after the wait', async () => {
    for (const jq of ['.counts |||', '.counts | no_such_function']) {
      const result = await vf([...SUITE_FLAGS, '--all', '--wait', '--jq', jq]);

      expect(result.exitCode, jq).toBe(1);
      expect(result.stderr).toContain('invalid --jq expression');
    }
    expect(requests).toHaveLength(0);
  });

  it('checks the --wait flags under --dry-run too', async () => {
    const result = await vf([...SUITE_FLAGS, '--all', '--wait', '--max-wait', '0s', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--max-wait must be more than zero');
    expect(requests).toHaveLength(0);
  });

  it('keeps stderr JSON in agent mode when --wait --dry-run fails before sending', async () => {
    const result = await vf([...SUITE_FLAGS, '--wait', '--dry-run', '--body', '{bad'], { agentMode: true });

    expect(result.exitCode).toBe(1);
    expect(jsonStream(result.stderr)).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });

  it('lists --wait and --max-wait in --usage, for create-suite and every command above it', async () => {
    for (const args of [[...SUITE_FLAGS, '--usage'], ['test', 'run', '--usage'], ['--usage']]) {
      const result = await vf(args);

      expect(result.exitCode, result.stderr).toBe(0);
      const block = result.stdout.slice(result.stdout.indexOf('cmd "create-suite"'));
      const createSuite = block.slice(0, block.search(/\n\s*\}\n/));
      expect(createSuite, args.join(' ')).toContain('flag "--wait"');
      expect(createSuite, args.join(' ')).toContain('flag "--max-wait <duration>"');
      expect(result.stdout.match(/flag "--wait"/g), args.join(' ')).toHaveLength(1);
    }
  });

  it('reports invalid flag values with the agent-mode envelope', async () => {
    for (const flags of [
      ['--max-wait', '5m'],
      ['--wait', '--max-wait', '0s'],
      ['--wait', '--timeout', '3s'],
      ['--wait', '--timeout', 'abc'],
      ['--wait', '--jq', '.counts |||'],
    ]) {
      const result = await vf([...SUITE_FLAGS, '--all', ...flags], { agentMode: true });

      expect(result.exitCode, flags.join(' ')).toBe(1);
      const events = jsonStream(result.stderr);
      expect(events, flags.join(' ')).toHaveLength(1);
      expect(events[0]!.error_type).toBe('invalid_flag_value');
    }
    expect(requests).toHaveLength(0);
  });
});

describe('create-suite IDs', () => {
  it('accepts comma-separated and repeated --test-ids, with or without --wait', async () => {
    await vf([...SUITE_FLAGS, '--test-ids', 'a,b', '--test-ids', ' c ']);

    expect(requests[0]!.body).toEqual({ testIDs: ['a', 'b', 'c'] });
  });

  it('accepts comma-separated --folder-ids', async () => {
    waitReplies = [waitReply({ total: 2, passed: 2, failed: 0, canceled: 0, unfinished: 0 })];

    await vf([...SUITE_FLAGS, '--folder-ids', 'f1,f2', '--wait']);

    expect(requests[0]!.body).toEqual({ folderIDs: ['f1', 'f2'] });
  });
});
