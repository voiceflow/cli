// Tests for `vf link` / `vf unlink`: pinning a project and environment to a
// directory so commands run inside it need no --project-id or
// --environment-alias.
//
// Every case runs the real binary in a fresh temporary directory with an
// isolated HOME, against a mock server on loopback. Nothing here reaches the
// network or reads the machine's real ~/.config/vf.
// Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

// Every variable that puts the CLI into agent mode. Mirrors the list in
// internal/output/agentmode.go; a stray one on the host would silently flip
// the renderer under test.
const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

const PROJECT_ID = '0123456789abcdef01234567';
const OTHER_PROJECT_ID = 'fedcba9876543210fedcba98';
const WORKSPACE_ID = 'VzElNm0wjL';

const environment = (alias: string) => ({
  name: alias === 'main' ? 'Production' : alias,
  alias,
  isMain: alias === 'main',
  releases: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  trafficPercentage: alias === 'main' ? 100 : 0,
});

let server: http.Server;
let serverURL: string;
let requests: string[] = [];
let home: string;
let cwd: string;

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-link-home-'));
  server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const url = new URL(req.url ?? '/', 'http://mock');
    const reply = (status: number, body: object) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === `/v1/stable/project/${PROJECT_ID}`) {
      return reply(200, {
        project: {
          id: PROJECT_ID,
          name: 'Returns bot',
          image: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
          workspaceID: WORKSPACE_ID,
          description: null,
        },
      });
    }
    if (url.pathname === '/v1/stable/environment') {
      return reply(200, { environments: [environment('main'), environment('dev')] });
    }
    const alias = url.pathname.match(/^\/v1\/stable\/environment\/([^/]+)$/)?.[1];
    if (alias === 'main' || alias === 'dev') return reply(200, { environment: environment(alias) });
    return reply(404, { statusCode: 404, message: 'Not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  requests = [];
  // Resolved, because the CLI reports real paths: on macOS the temp dir is
  // /var/…, a symlink to /private/var/….
  cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vf-link-cwd-')));
});

function run(args: string[], opts: { agentMode?: boolean; dir?: string } = {}) {
  const env: Record<string, string | undefined> = Object.fromEntries(AGENT_ENV_VARS.map((name) => [name, undefined]));
  Object.assign(env, { HOME: home, CI: '', VF_TOKEN: 'vfp_test' });
  if (opts.agentMode) env.CLAUDECODE = '1';
  return execa({ reject: false, timeout: 20_000, stdin: 'ignore', env, extendEnv: true, cwd: opts.dir ?? cwd })(VF, args);
}

const linkFile = (dir = cwd) => path.join(dir, '.voiceflow', 'project.json');
const readLink = (dir = cwd) => JSON.parse(fs.readFileSync(linkFile(dir), 'utf-8'));

function writeLink(body: object, dir = cwd) {
  fs.mkdirSync(path.join(dir, '.voiceflow'), { recursive: true });
  fs.writeFileSync(linkFile(dir), JSON.stringify(body));
}

/** The request line a --dry-run would have sent. */
function dryRunURL(stderr: string): URL {
  const line = stderr.split('\n').find((l) => l.startsWith('[DRY-RUN] Would send:'));
  expect(line, `no dry-run request in:\n${stderr}`).toBeDefined();
  return new URL(line!.replace(/^\[DRY-RUN\] Would send: \w+ /, ''));
}

describe('vf link', () => {
  it('links the project, writes .voiceflow/project.json, and prints a snippet for agents', async () => {
    const result = await run(['link', PROJECT_ID, '--server-url', serverURL]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Linked this directory to "Returns bot"');
    expect(result.stdout).toContain('CLAUDE.md');
    expect(readLink()).toMatchObject({ projectID: PROJECT_ID, projectName: 'Returns bot', workspaceID: WORKSPACE_ID, environmentAlias: 'main' });
    expect(requests).toEqual([
      `GET /v1/stable/project/${PROJECT_ID}`,
      `GET /v1/stable/environment/main?projectID=${PROJECT_ID}`,
    ]);
  });

  it('returns a structured result in agent mode, with the instructions snippet', async () => {
    const result = await run(['link', PROJECT_ID, '--environment-alias', 'dev', '--server-url', serverURL, '--output-format', 'json'], { agentMode: true });

    expect(result.exitCode, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out).toMatchObject({ projectID: PROJECT_ID, environmentAlias: 'dev', file: linkFile() });
    expect(out.agentInstructions).toContain('vf environment compile');
    expect(readLink().environmentAlias).toBe('dev');
  });

  it('explains that a Creator URL carries a version id, and sends nothing', async () => {
    const result = await run(['link', `https://creator.voiceflow.com/project/${PROJECT_ID}/canvas/abc`, '--server-url', serverURL]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('version id');
    expect(result.stderr).toContain('Settings → General');
    expect(requests).toEqual([]);
    expect(fs.existsSync(linkFile())).toBe(false);
  });

  it('names the environments a project has when the alias is wrong', async () => {
    const result = await run(['link', PROJECT_ID, '--environment-alias', 'staging', '--server-url', serverURL], { agentMode: true });

    expect(result.exitCode).toBe(1);
    const envelope = JSON.parse(result.stderr);
    expect(envelope.error_type).toBe('environment_not_found');
    expect(JSON.stringify(envelope.hints)).toContain('main, dev');
    expect(fs.existsSync(linkFile())).toBe(false);
  });

  it('writes nothing on --dry-run', async () => {
    const result = await run(['link', PROJECT_ID, '--dry-run']);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain('[DRY-RUN] Would write');
    expect(fs.existsSync(linkFile())).toBe(false);
  });
});

describe('commands in a linked directory', () => {
  beforeEach(() => writeLink({ projectID: PROJECT_ID, projectName: 'Returns bot', workspaceID: WORKSPACE_ID, environmentAlias: 'dev' }));

  it('use the linked project and environment, from any directory below', async () => {
    const deep = path.join(cwd, 'src', 'agents');
    fs.mkdirSync(deep, { recursive: true });

    const result = await run(['playbook', 'list', '--dry-run'], { dir: deep });

    expect(result.exitCode, result.stderr).toBe(0);
    const sent = dryRunURL(result.stderr);
    expect(sent.searchParams.get('projectID')).toBe(PROJECT_ID);
    expect(sent.searchParams.get('environmentAlias')).toBe('dev');
  });

  it('let an explicit flag win', async () => {
    const result = await run(['playbook', 'list', '--project-id', OTHER_PROJECT_ID, '--dry-run']);

    expect(result.exitCode, result.stderr).toBe(0);
    const sent = dryRunURL(result.stderr);
    expect(sent.searchParams.get('projectID')).toBe(OTHER_PROJECT_ID);
    expect(sent.searchParams.get('environmentAlias')).toBe('dev');
  });

  it('never fill in what a delete destroys', async () => {
    const result = await run(['project', 'delete', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('missing required flag: --project-id');
  });

  it('show the link in vf whoami', async () => {
    const result = await run(['whoami']);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Linked project:');
    expect(result.stdout).toContain(`Returns bot (${PROJECT_ID})`);
    expect(result.stdout).toContain(linkFile());
  });

  // transcript search carries the environment in its JSON body, not in the
  // query: a linked value must not replace one the user wrote there.
  it('let a value in --body win over the link', async () => {
    const withBody = await run(['transcript', 'search', '--body', '{"environmentAlias":"production"}', '--dry-run']);
    expect(withBody.exitCode, withBody.stderr).toBe(0);
    expect(withBody.stderr).toContain('"environmentAlias": "production"');
    expect(dryRunURL(withBody.stderr).searchParams.get('projectID')).toBe(PROJECT_ID);

    const withoutBody = await run(['transcript', 'search', '--dry-run']);
    expect(withoutBody.exitCode, withoutBody.stderr).toBe(0);
    expect(withoutBody.stderr).toContain('"environmentAlias": "dev"');
  });
});

describe('a damaged link', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(cwd, '.voiceflow'), { recursive: true });
    fs.writeFileSync(linkFile(), '{broken');
  });

  it('fails project commands with the file named and the fix', async () => {
    const result = await run(['playbook', 'list', '--dry-run'], { agentMode: true });

    expect(result.exitCode).toBe(1);
    const envelope = JSON.parse(result.stderr);
    expect(envelope.error_type).toBe('invalid_link');
    expect(envelope.message).toContain(linkFile());
    expect(JSON.stringify(envelope.hints)).toContain('vf unlink');
  });

  it('does not break commands that take no project', async () => {
    const result = await run(['version']);
    expect(result.exitCode, result.stderr).toBe(0);
  });

  it('can still be removed with vf unlink', async () => {
    const result = await run(['unlink']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(fs.existsSync(linkFile())).toBe(false);
  });
});

describe('agent-mode output', () => {
  // TOON, agent mode's default, prints a json tag verbatim, so a tag option
  // like omitempty would become part of the key.
  it('uses plain keys for vf link and vf unlink', async () => {
    const linked = await run(['link', PROJECT_ID, '--server-url', serverURL], { agentMode: true });
    expect(linked.exitCode, linked.stderr).toBe(0);
    expect(linked.stdout).not.toContain(',omit');

    const unlinked = await run(['unlink'], { agentMode: true });
    expect(unlinked.exitCode, unlinked.stderr).toBe(0);
    expect(unlinked.stdout).toContain('removed');
    expect(unlinked.stdout).not.toContain(',omit');
  });
});

describe('vf unlink', () => {
  it('removes the link that applies here, even from a subdirectory, and is safe to repeat', async () => {
    writeLink({ projectID: PROJECT_ID, projectName: 'Returns bot' });
    const deep = path.join(cwd, 'src');
    fs.mkdirSync(deep);

    const first = await run(['unlink'], { dir: deep });
    expect(first.exitCode, first.stderr).toBe(0);
    expect(first.stdout).toContain(`Unlinked "Returns bot" (${PROJECT_ID})`);
    expect(fs.existsSync(path.join(cwd, '.voiceflow'))).toBe(false);

    const again = await run(['unlink'], { dir: deep });
    expect(again.exitCode, again.stderr).toBe(0);
    expect(again.stdout).toContain('Nothing to unlink');
  });
});
