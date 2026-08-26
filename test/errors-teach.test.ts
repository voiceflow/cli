// Hermetic tests for the "errors that teach" hooks (internal/sdk/sdkinternal/
// hooks/teach.go): no-token preflight, malformed-token warnings, and 4XX hint
// + docs_url injection. Uses a local mock API — no live credentials.
//
// Requires the CLI binary at the repo root: go build -o vf ./cmd/vf

import { execa } from 'execa';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');
const AGENT_ENV = { CLAUDE_CODE: '1', VF_TOKEN: '' } as const;

const $vf = (args: string[], env: Record<string, string> = {}) =>
  execa({ reject: false, env: { ...AGENT_ENV, ...env }, stdin: 'ignore' })(VF, args);

/** stderr of agent-mode errors is a JSON envelope followed by plain lines. */
function parseEnvelope(stderr: string): Record<string, unknown> {
  const start = stderr.indexOf('{');
  expect(start, `no JSON envelope in stderr:\n${stderr}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = start; i < stderr.length; i += 1) {
    if (stderr[i] === '{') depth += 1;
    if (stderr[i] === '}') depth -= 1;
    if (depth === 0) return JSON.parse(stderr.slice(start, i + 1));
  }
  throw new Error(`unterminated JSON envelope in stderr:\n${stderr}`);
}

let mock: Server;
let mockURL: string;

beforeAll(async () => {
  mock = createServer((req, res) => {
    const reply = (code: number, body: object, headers: Record<string, string> = {}) => {
      const data = JSON.stringify(body);
      res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
      res.end(data);
    };
    if (req.url?.includes('/project/')) return reply(404, { statusCode: 404, message: 'Project not found' });
    if (req.url?.includes('/workspace')) return reply(429, { statusCode: 429, message: 'Too many requests' }, { 'Retry-After': '17' });
    return reply(401, { statusCode: 401, message: 'Unauthorized' });
  });
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
  mockURL = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});

afterAll(() => {
  mock.close();
});

describe('no-token preflight', () => {
  it('fails before any network call with setup guidance', async () => {
    const result = await $vf(['workspace', 'list', '--server-url', 'http://127.0.0.1:1']); // unroutable — must not be contacted
    expect(result.exitCode).toBe(1);

    const envelope = parseEnvelope(result.stderr);
    expect(envelope.error_type).toBe('authentication_error');
    expect(envelope.message).toContain('request was not sent');
    expect(envelope.docs_url).toBe('https://www.voiceflow.com/docs/api-reference/authentication');
    expect(JSON.stringify(envelope.hints)).toContain('export VF_TOKEN=vfp_');
  });

  it('does not block --dry-run', async () => {
    const result = await $vf(['workspace', 'list', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[DRY-RUN]');
    expect(result.stderr).toContain('Network call skipped');
  });
});

describe('malformed-token warnings', () => {
  it('warns on a legacy Dialog Manager key but still sends the request', async () => {
    const result = await $vf(['workspace', 'list', '--token', 'VF.DM.legacy', '--server-url', mockURL]);
    expect(result.exitCode).toBe(1); // mock replies 429 — request WAS sent
    expect(result.stderr).toContain('legacy Dialog Manager API key');
    expect(result.stderr).toContain('vfp_');
  });

  it('warns on surrounding whitespace', async () => {
    const result = await $vf(['workspace', 'list', '--token', 'vfp_abc ', '--server-url', mockURL]);
    expect(result.stderr).toContain('whitespace');
  });
});

describe('error hint injection', () => {
  it('injects a list-command hint and docs_url on 404', async () => {
    const result = await $vf(['project', 'get', '--project-id', 'missing', '--token', 'vfp_x', '--server-url', mockURL]);
    expect(result.exitCode).toBe(1);

    const envelope = parseEnvelope(result.stderr);
    expect(envelope.error_type).toBe('not_found');
    expect(envelope.docs_url).toBe('https://www.voiceflow.com/docs/cli/commands/project');
    expect(JSON.stringify(envelope.hints)).toContain('vf project list');
  });

  it('surfaces Retry-After on 429', async () => {
    const result = await $vf(['workspace', 'list', '--token', 'vfp_x', '--server-url', mockURL]);
    const envelope = parseEnvelope(result.stderr);
    expect(JSON.stringify(envelope.hints)).toContain('17 seconds');
  });

  it('teaches token expiry and renewal on 401', async () => {
    const result = await $vf(['playbook', 'list', '--project-id', 'p', '--environment-alias', 'main', '--token', 'vfp_expired', '--server-url', mockURL]);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope.error_type).toBe('authentication_error');
    expect(JSON.stringify(envelope.hints)).toContain('expire');
    expect(JSON.stringify(envelope.hints)).toContain('export VF_TOKEN=vfp_');
  });
});
