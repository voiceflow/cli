// Tests for the --agent-mode flag (internal/output/agentmode.go): an explicit
// value wins over agent detection from the environment, in both directions.
//
// Execute settles agent mode once before cobra parses flags, from the
// environment alone, and that first answer used to be final, so the flag did
// nothing: --agent-mode=false under Claude Code still printed JSON envelopes,
// and --agent-mode in a plain shell still printed human errors.
//
// Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

// Every variable that puts the CLI into agent mode. Mirrors the list in
// internal/output/agentmode.go; each case sets the one it needs.
const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

let home: string;

beforeAll(() => {
  // vf keeps credentials under HOME; an empty one keeps the developer's out.
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-agent-mode-home-'));
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function run(args: string[], env: Record<string, string> = {}) {
  const cleared: Record<string, string | undefined> = Object.fromEntries(AGENT_ENV_VARS.map((name) => [name, undefined]));
  return execa({
    reject: false,
    timeout: 20_000,
    stdin: 'ignore',
    env: {
      ...cleared,
      HOME: home,
      VF_TOKEN: '',
      // The no-token cases must find no token anywhere. An empty HOME hides the
      // macOS Keychain; on Linux the keyring is reached over D-Bus, so point
      // the session bus at a socket that does not exist.
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${path.join(home, 'no-session-bus')}`,
      ...env,
    },
    extendEnv: true,
  })(VF, args);
}

// No token and an unroutable server: vf fails its preflight before sending
// anything, and reports it in whichever mode is in effect.
const NO_TOKEN = ['workspace', 'list', '--server-url', 'http://127.0.0.1:1'];

/** In agent mode stderr is the JSON envelope and nothing else. */
const isEnvelope = (stderr: string) => stderr.trimStart().startsWith('{');

describe('--agent-mode', () => {
  it('turns agent mode off under an agent', async () => {
    const result = await run([...NO_TOKEN, '--agent-mode=false'], { CLAUDECODE: '1' });

    expect(result.exitCode).toBe(1);
    expect(isEnvelope(result.stderr), result.stderr).toBe(false);
    expect(result.stderr).toContain('API Error');
  });

  it('turns agent mode on outside an agent', async () => {
    const result = await run([...NO_TOKEN, '--agent-mode']);

    expect(result.exitCode).toBe(1);
    expect(isEnvelope(result.stderr), result.stderr).toBe(true);
    expect(JSON.parse(result.stderr).error_type).toBe('authentication_error');
  });

  it('leaves detection from the environment in charge when it is not given', async () => {
    const underAnAgent = await run(NO_TOKEN, { CLAUDECODE: '1' });
    const inAPlainShell = await run(NO_TOKEN);

    expect(isEnvelope(underAnAgent.stderr), underAnAgent.stderr).toBe(true);
    expect(isEnvelope(inAPlainShell.stderr), inAPlainShell.stderr).toBe(false);
  });

  // A bad flag value is reported after the command has run, so this checks the
  // flag reaches that path too.
  it('also decides how a bad flag value is reported', async () => {
    const result = await run(
      ['agent', 'update', '--project-id', 'p', '--environment-alias', 'main', '--dry-run', '--token', 'vfp_x',
        '--llm', 'gpt-4', '--agent-mode=false'],
      { CLAUDECODE: '1' },
    );

    expect(result.exitCode).toBe(1);
    expect(isEnvelope(result.stderr), result.stderr).toBe(false);
    expect(result.stderr).toContain('invalid value for --llm');
  });
});
