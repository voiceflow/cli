// Tests for string flags whose field is not text (internal/flagutil/stringflag.go).
//
// The generated metadata declares some expanded union-variant flags as plain
// strings although their fields are objects or nullable strings. Each failed
// with "cannot convert string to ..." whatever value it was given, so the flag
// could not be used at all. They now take JSON, the way a JSON flag does.
//
// Most cases read the request body out of the --dry-run preview on stderr; the
// credentials case sends its request to a local server instead, since the
// preview hides credentials. Nothing reaches the network. The exit code is not
// asserted: until the dry-run fix for operations that succeed with 201 lands,
// those dry runs exit 1 after printing the preview.
//
// Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

// Every variable that puts the CLI into agent mode. Mirrors the list in
// internal/output/agentmode.go; a stray one on the host would change the output.
const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

let home: string;
let server: http.Server;
let serverURL: string;
let received: unknown[] = [];

beforeAll(async () => {
  // vf keeps credentials under HOME; an empty one keeps the developer's out.
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-variant-flags-home-'));

  // Records each request body it receives.
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push(body ? JSON.parse(body) : null);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(home, { recursive: true, force: true });
});

function vf(args: string[]) {
  const env: Record<string, string | undefined> = Object.fromEntries(AGENT_ENV_VARS.map((name) => [name, undefined]));
  env.HOME = home;
  return execa({ reject: false, timeout: 20_000, stdin: 'ignore', env, extendEnv: true })(VF, [...args, '--token', 'vfp_x']);
}

const dryRun = (args: string[]) => vf([...args, '--dry-run']);

/** The request body from a --dry-run preview, parsed. */
function sentBody(stderr: string): Record<string, unknown> {
  const match = stderr.match(/\[DRY-RUN\] Body:\n([\s\S]*?)\n\[DRY-RUN\] Network call skipped\./);
  expect(match, `no request body in:\n${stderr}`).not.toBeNull();
  return JSON.parse(match![1]!);
}

const TURN = ['test', 'turn', 'create', '--project-id', 'p', '--environment-alias', 'main', '--body-param.agent.test-id', 't'];
const EVALUATION = [
  'evaluation', 'create', '--project-id', 'p', '--body-param.boolean.enabled', '--body-param.boolean.name', 'n',
  '--body-param.boolean.prompt', 'p', '--body-param.boolean.true-prompt', 't', '--body-param.boolean.false-prompt', 'f',
];

describe('a string flag whose field is not text', () => {
  it('takes a JSON object: test turn create --body-param.agent.payload', async () => {
    const result = await dryRun([...TURN, '--body-param.agent.payload', '{"sequential":true}']);

    expect(result.stderr).not.toContain('cannot convert');
    expect(sentBody(result.stderr)).toMatchObject({ type: 'agent', testID: 't', payload: { sequential: true } });
  });

  // Sent to a local server rather than read from a --dry-run preview: the
  // preview hides credentials, so only the request itself shows they arrived.
  it('takes a JSON object: integration connect --body-param.twilio.credentials', async () => {
    received = [];
    const result = await vf([
      'integration', 'connect', '--project-id', 'p', '--integration', 'twilio', '--server-url', serverURL,
      '--body-param.twilio.credentials', '{"apiKeySid":"sid","apiKeySecret":"not-a-secret","accountSid":"acct"}',
    ]);

    expect(result.stderr).not.toContain('cannot convert');
    expect(received).toEqual([
      { integration: 'twilio', credentials: { apiKeySid: 'sid', apiKeySecret: 'not-a-secret', accountSid: 'acct' } },
    ]);
  });

  it('takes plain text or null for a nullable string: evaluation create --body-param.boolean.description', async () => {
    const text = await dryRun([...EVALUATION, '--body-param.boolean.description', 'Checks tone']);
    expect(sentBody(text.stderr)).toMatchObject({ type: 'boolean', description: 'Checks tone' });

    const cleared = await dryRun([...EVALUATION, '--body-param.boolean.description', 'null']);
    expect(sentBody(cleared.stderr)).toMatchObject({ description: null });
  });

  it('says it wants JSON when given text for an object', async () => {
    const result = await dryRun([...TURN, '--body-param.agent.payload', 'sequential']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('invalid value for --body-param.agent.payload: expected a JSON value');
  });
});
