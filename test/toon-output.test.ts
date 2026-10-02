// Tests for TOON output: the default format in agent mode, so what every AI
// coding agent reads.
//
// TOON used to be encoded from the SDK's Go values by reflection, which put
// json tag options into keys ("instructions,omitzero"), printed optional
// fields as null even when they were set — the agent's instructions among
// them — and showed union types as their Go wrappers. It is now encoded from
// the same JSON the json format prints.
//
// Every case runs the real binary with an isolated HOME against a mock server
// on loopback. Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

// Every variable that puts the CLI into agent mode; see flag-errors.test.ts.
const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

const PROJECT = ['--project-id', '0123456789abcdef01234567', '--environment-alias', 'main'];
const INSTRUCTIONS = 'Route refund questions to the Refunds playbook.';

const FIXTURES: Record<string, object> = {
  '/v2/stable/agent': {
    agent: {
      llm: { defaults: { model: 'voiceflow-core-4.1' } },
      prompt: 'You are Nova, the returns assistant.',
      instructions: INSTRUCTIONS,
      includeGuidelines: false,
      promptLineCount: 1,
      instructionsLineCount: 1,
      playbooks: [],
      workflows: [],
      pathToolOrder: [],
    },
  },
  '/v2/stable/tool': {
    tools: [
      {
        type: 'function', id: 'tool-1', functionID: 'fn-1', description: 'Look up an order',
        createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
        asyncExecution: false, inputVariables: {}, captureResponse: {}, captureInputVariables: {}, messages: null,
      },
    ],
  },
};

let server: http.Server;
let serverURL: string;
let home: string;

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-toon-home-'));
  server = http.createServer((req, res) => {
    const fixture = FIXTURES[new URL(req.url ?? '/', 'http://mock').pathname];
    res.writeHead(fixture ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(fixture ?? { statusCode: 404, message: 'Not found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(home, { recursive: true, force: true });
});

function run(args: string[]) {
  const env: Record<string, string | undefined> = Object.fromEntries(AGENT_ENV_VARS.map((name) => [name, undefined]));
  Object.assign(env, { HOME: home, VF_TOKEN: 'vfp_test', CLAUDECODE: '1' });
  return execa({ reject: false, timeout: 20_000, stdin: 'ignore', env, extendEnv: true })(VF, [...args, '--server-url', serverURL]);
}

describe('TOON output in agent mode', () => {
  it('is the default, and its keys carry no json tag options', async () => {
    const result = await run(['agent', 'get', ...PROJECT, '--include-instructions']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('prompt:'); // TOON, not JSON
    expect(result.stdout).not.toContain(',omit');
  });

  it('shows optional fields that are set — the agent instructions among them', async () => {
    const result = await run(['agent', 'get', ...PROJECT, '--include-instructions', '--output-format', 'toon']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(INSTRUCTIONS);
  });

  it('renders a union as the API returns it, not as its Go wrapper', async () => {
    const result = await run(['tool', 'list', ...PROJECT, '--global', '--output-format', 'toon']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('functionID: fn-1');
    expect(result.stdout).not.toMatch(/StableToolV2|UnknownRaw/);
  });
});
