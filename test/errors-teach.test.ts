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

/**
 * In agent mode stderr is the JSON envelope and nothing else. It used to be the
 * envelope followed by a duplicate plain-text line, because every printer in
 * internal/output prints AND returns the error while cmd/vf/main.go printed
 * whatever Execute returned. This parser reads the first balanced object, so it
 * tolerated the duplicate; the "is nothing but JSON" assertions below are what
 * actually pin the single-print contract.
 */
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

  it('does not block --dry-run, in every bool spelling cobra accepts', async () => {
    for (const spelling of ['--dry-run', '--dry-run=true', '--dry-run=True', '--dry-run=T', '--dry-run=1']) {
      const result = await $vf(['workspace', 'list', spelling]);
      expect(result.exitCode, `${spelling}: ${result.stderr}`).toBe(0);
      expect(result.stderr).toContain('[DRY-RUN]');
    }
  });

  it('fires under the env var Claude Code actually sets (CLAUDECODE, no underscore)', async () => {
    const result = await execa({ reject: false, env: { CLAUDECODE: '1', CLAUDE_CODE: '', VF_TOKEN: '' }, stdin: 'ignore' })(
      VF, ['workspace', 'list', '--server-url', 'http://127.0.0.1:1'],
    );
    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stderr); // agent-mode structured envelope, not pretty output
    expect(envelope.error_type).toBe('authentication_error');
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

describe('required-flag preflight', () => {
  it('fails locally with the exact flag name when a required path param is missing', async () => {
    // Unroutable server: proves the request never leaves the machine.
    const result = await $vf(['project', 'get', '--token', 'vfp_x', '--server-url', 'http://127.0.0.1:1']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('missing required flag: --project-id');
    expect(result.stderr).not.toContain('statusCode'); // no server round-trip happened
  });

  it('is not bypassed by piped stdin on params-only commands', async () => {
    const result = await execa({ reject: false, env: { ...AGENT_ENV }, input: '{}' })(
      VF, ['project', 'get', '--token', 'vfp_x', '--server-url', 'http://127.0.0.1:1'],
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('missing required flag: --project-id');
    expect(result.stderr).not.toContain('statusCode');
  });

  it('still accepts whole-body input in place of individual required flags', async () => {
    const result = await $vf([
      'project', 'create',
      '--body', '{"name":"x","workspaceID":"w","type":"webchat"}',
      '--token', 'vfp_x', '--server-url', mockURL,
    ]);
    // The mock replies 401 — reaching it proves the body path was not blocked locally.
    const envelope = parseEnvelope(result.stderr);
    expect(envelope.statusCode).toBe(401);
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
    expect(JSON.stringify(envelope.hints)).toContain('Retry-After: 17');
  });

  it('teaches token expiry and renewal on 401', async () => {
    const result = await $vf(['playbook', 'list', '--project-id', 'p', '--environment-alias', 'main', '--token', 'vfp_expired', '--server-url', mockURL]);
    const envelope = parseEnvelope(result.stderr);
    expect(envelope.error_type).toBe('authentication_error');
    expect(JSON.stringify(envelope.hints)).toContain('expire');
    expect(JSON.stringify(envelope.hints)).toContain('export VF_TOKEN=vfp_');
  });
});

describe('agent-mode errors are printed exactly once', () => {
  // Every printer in internal/output writes the error to stderr and also returns
  // it, and main.go printed whatever Execute returned — so a single failure
  // reached stderr twice. AgentModeError's own doc comment promised the
  // opposite ("outputs structured JSON exactly once… Callers must NOT print the
  // error again"), but main.go is generated and printed unconditionally.
  //
  // This matters because the envelope is the machine-readable product: a
  // trailing non-JSON line after a JSON object is exactly what breaks a parser
  // that does the obvious thing.
  const cases: Array<[name: string, args: string[]]> = [
    ['CLI-level error (AgentModeError)', ['configure']],
    ['preflight error (no token)', ['workspace', 'list']],
    ['flag-value error', ['agent', 'update', '--project-id', 'p', '--environment-alias', 'main',
      '--dry-run', '--token', 'vfp_x', '--llm', 'not json']],
  ];

  for (const [name, args] of cases) {
    it(`${name}: stderr is nothing but the JSON envelope`, async () => {
      const result = await $vf(args);
      expect(result.exitCode, 'must still fail').not.toBe(0);
      // The strict test: the whole stream parses, with no trailing prose.
      expect(() => JSON.parse(result.stderr.trim()), `stderr was not pure JSON:\n${result.stderr}`).not.toThrow();
    });

    it(`${name}: the message does not appear twice`, async () => {
      const result = await $vf(args);
      const envelope = parseEnvelope(result.stderr);
      const message = String(envelope.message ?? envelope.error ?? '');
      expect(message.length, 'envelope carried no message to check').toBeGreaterThan(0);
      const after = result.stderr.slice(result.stderr.lastIndexOf('}') + 1);
      expect(after.trim(), `text printed after the envelope:\n${after}`).toBe('');
    });
  }
});
