// Tests for what --dry-run and --debug hide when they print request and
// response bodies (internal/client/redact.go).
//
// The redaction rule only matched lowercase names such as api_key, while the
// Voiceflow API names its secrets in camelCase, so integration credentials,
// secret values and Authorization headers printed in full to stderr, where a
// coding agent keeps them. Each case below sends a canary in a secret field and
// checks it never reaches stderr, while the ordinary fields beside it do.
//
// --dry-run sends nothing; --debug talks to a local mock server.
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

beforeAll(async () => {
  // vf keeps credentials under HOME; an empty one keeps the developer's out.
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-redaction-home-'));

  // Answers every request with an API tool whose header carries a token, as
  // the API returns a tool's headers the way they were saved.
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      apiTools: [{ id: 't1', name: 'visible-tool', headers: [{ key: 'Authorization', value: 'Bearer canary-response' }] }],
    }));
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

describe('--dry-run hides secrets and keeps the rest', () => {
  const cases: Array<[name: string, args: string[], secret: string, kept: string]> = [
    ['an integration credential',
      ['integration', 'connect', '--project-id', 'p', '--integration', 'twilio', '--body-param.twilio',
        '{"integration":"twilio","credentials":{"apiKeySid":"SK1","apiKeySecret":"canary-credential","accountSid":"AC1"}}'],
      'canary-credential', '"integration": "twilio"'],
    ['an Authorization header',
      ['mcp-server', 'create', '--project-id', 'p', '--environment-alias', 'main', '--name', 'n', '--url', 'https://mcp.example.com',
        '--headers', '[{"key":"Authorization","value":"Bearer canary-header"},{"key":"X-Region","value":"eu-west"}]'],
      'canary-header', 'eu-west'],
    ["a secret's value on create",
      ['secret', 'create', '--project-id', 'p', '--name', 'STRIPE_KEY', '--default-value', 'canary-create'],
      'canary-create', 'STRIPE_KEY'],
    ["a secret's value on set-value",
      ['secret', 'set-value', '--project-id', 'p', '--secret-id', 's1', '--value', 'canary-set', '--environment-alias', 'main',
        '--version-variant', 'draft'],
      'canary-set', '"environmentAlias": "main"'],
  ];

  for (const [name, args, secret, kept] of cases) {
    it(name, async () => {
      const result = await vf([...args, '--dry-run']);

      // Some of these operations succeed with 201, and on master their dry runs
      // exit 1 after the preview, so the preview is what is checked.
      expect(result.stderr).toContain('[DRY-RUN] Body:');
      expect(result.stderr).not.toContain(secret);
      expect(result.stderr).toContain(kept);
    });
  }
});

/**
 * One body that --debug printed. The mock's answers are not complete API
 * objects, so the command may still fail afterwards; only what --debug printed
 * is checked.
 */
function debugBody(stderr: string, title: 'Request Body' | 'Response Body'): string {
  const match = stderr.match(new RegExp(`\\[DEBUG\\] ${title}:\\n((?:[ \\t].*\\n?)*)`));
  expect(match, `no ${title} in:\n${stderr}`).not.toBeNull();
  return match![1]!;
}

describe('--debug hides secrets in requests and responses', () => {
  it("hides a secret's value in the request body", async () => {
    const result = await vf([
      'secret', 'set-value', '--project-id', 'p', '--secret-id', 's1', '--value', 'canary-debug', '--environment-alias', 'main',
      '--version-variant', 'draft', '--debug', '--server-url', serverURL,
    ]);

    const body = debugBody(result.stderr, 'Request Body');
    expect(body).not.toContain('canary-debug');
    expect(body).toContain('"environmentAlias": "main"');
  });

  it('hides an Authorization header in the response body', async () => {
    const result = await vf(['api-tool', 'list', '--project-id', 'p', '--environment-alias', 'main', '--debug', '--server-url', serverURL]);

    const body = debugBody(result.stderr, 'Response Body');
    expect(body).not.toContain('canary-response');
    expect(body).toContain('visible-tool');
  });
});
