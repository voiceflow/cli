// Tests for --dry-run (internal/client/diagnostics.go, internal/output/dryrun.go):
// it prints the request it would send and exits 0, whatever status code the
// real operation succeeds with. Nothing reaches the network.
//
// A dry run hands the SDK a stand-in 200 instead of sending the request, and
// the SDK accepts only an operation's documented success code. The 28
// operations that succeed only with 201 (every create, plus environment clone
// and publish, evaluation run and test run create) used to print the preview,
// then "API Error (HTTP 200): unknown status code returned", and exit 1.
//
// Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

// Every variable that puts the CLI into agent mode. Mirrors the list in
// internal/output/agentmode.go; a stray one on the host would flip the renderer.
const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

let home: string;

beforeAll(() => {
  // vf keeps credentials under HOME; an empty one keeps the developer's out.
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-dry-run-home-'));
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function dryRun(args: string[], opts: { agentMode?: boolean } = {}) {
  const env: Record<string, string | undefined> = Object.fromEntries(AGENT_ENV_VARS.map((name) => [name, undefined]));
  env.HOME = home;
  if (opts.agentMode) env.CLAUDECODE = '1';
  return execa({ reject: false, timeout: 20_000, stdin: 'ignore', env, extendEnv: true })(
    VF, [...args, '--dry-run', '--token', 'vfp_x'],
  );
}

const PREVIEWED = '[DRY-RUN] Network call skipped.';

// Operations that succeed only with 201, and one that succeeds with 200, which
// always worked.
const COMMANDS: Array<[name: string, args: string[]]> = [
  ['project create', ['project', 'create', '--name', 'n', '--type', 'webchat', '--workspace-id', 'w']],
  ['environment publish', ['environment', 'publish', '--project-id', 'p', '--environment-alias', 'main', '--name', 'v1']],
  ['agent update', ['agent', 'update', '--project-id', 'p', '--environment-alias', 'main', '--prompt', 'x']],
];

describe('--dry-run', () => {
  for (const [name, args] of COMMANDS) {
    it(`previews vf ${name} and exits 0`, async () => {
      const result = await dryRun(args);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toContain(PREVIEWED);
      expect(result.stderr).not.toContain('API Error');
      expect(result.stderr).not.toContain('unknown status code');
    });
  }

  it('reports no error in agent mode or with --output-format json either', async () => {
    const [, createProject] = COMMANDS[0]!;
    for (const result of [
      await dryRun(createProject, { agentMode: true }),
      await dryRun([...createProject, '--output-format', 'json']),
    ]) {
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toContain(PREVIEWED);
      expect(result.stderr).not.toContain('"error');
    }
  });

  // The rule must not hide real failures: a request that cannot be built fails
  // before anything is previewed, and is still an error.
  it('still fails when the request cannot be built', async () => {
    const result = await dryRun(['tool', 'create', '--project-id', 'p', '--environment-alias', 'main']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain(PREVIEWED);
    expect(result.stderr).toContain('error serializing request body');
  });
});
