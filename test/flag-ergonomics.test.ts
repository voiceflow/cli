// Tests for how flag VALUES are interpreted and how failures are reported.
//
// Three behaviours ship together here because they are one story: the moment a
// person or an agent types a flag.
//
//   1. JSON flags whose destination is a string accept raw text.
//   2. Flags that cannot accept raw text fail with an error that teaches.
//   3. Help shows the flag's real type, not a word borrowed from its prose.
//
// Every case runs the real binary with --dry-run, so nothing here touches the
// network. Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

const BASE = ['agent', 'update', '--project-id', 'p', '--environment-alias', 'main', '--dry-run', '--token', 'vfp_x'];

/** Runs vf with agent-detection env vars stripped, so human output is exercised. */
function run(args: string[], opts: { agentMode?: boolean } = {}) {
  const env: Record<string, string | undefined> = opts.agentMode
    ? { CLAUDECODE: '1' }
    : { CLAUDECODE: undefined, CLAUDE_CODE: undefined, CURSOR_AGENT: undefined };
  return execa({ reject: false, timeout: 20_000, stdin: 'ignore', env, extendEnv: true })(VF, args);
}

/** Pull a field back out of the --dry-run request preview. */
function sent(output: string, field: string): string | null {
  const m = output.match(new RegExp(`"${field}":\\s*(null|"(?:[^"\\\\]|\\\\.)*")`));
  return m ? m[1] : null;
}

describe('string-valued JSON flags accept raw text', () => {
  it('takes markdown prose without JSON quoting', async () => {
    const r = await run([...BASE, '--instructions', 'You are a support agent for Acme.']);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('"You are a support agent for Acme."');
  });

  it('preserves newlines and quotes in prose', async () => {
    const r = await run([...BASE, '--instructions', 'Line one\nSay "hello" politely.']);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('"Line one\\nSay \\"hello\\" politely."');
  });

  // The reason these flags are JSON-typed at all. If this regresses, the fallback
  // has swallowed the one case the JSON encoding exists to express.
  it('still sends a real JSON null for --instructions null', async () => {
    const r = await run([...BASE, '--instructions', 'null']);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('null');
  });

  it('leaves an explicitly quoted JSON string unchanged', async () => {
    const r = await run([...BASE, '--instructions', '"already json"']);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('"already json"');
  });

  // Documented edge case: valid JSON of the wrong shape is indistinguishable
  // from prose, so it is stored as text. Asserted so the trade stays deliberate.
  it('stores a JSON object passed to a text field as literal text', async () => {
    const r = await run([...BASE, '--instructions', '{"note":"hi"}']);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('"{\\"note\\":\\"hi\\"}"');
  });
});

describe('structured flags still reject raw text', () => {
  // The fallback must not become "anything goes". A mistyped object is still an
  // error, because storing prose in a field that models an object is nonsense.
  for (const flag of ['llm', 'knowledge-base-tool']) {
    it(`--${flag} fails rather than silently storing text`, async () => {
      const r = await run([...BASE, `--${flag}`, 'not json at all']);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain(`invalid value for --${flag}`);
    });
  }

  it('explains what was wanted, echoes what was passed, and shows a worked example', async () => {
    const r = await run([...BASE, '--llm', 'gpt-4']);
    expect(r.stderr).toContain('expected a JSON value');
    expect(r.stderr).toContain('you passed: gpt-4');
    expect(r.stderr).toContain(`--llm '{"key":"value"}'`);
    expect(r.stderr).toContain('--llm null');
  });

  it('emits a structured envelope in agent mode', async () => {
    const r = await run([...BASE, '--llm', 'gpt-4'], { agentMode: true });
    const json = JSON.parse(r.stderr.slice(r.stderr.indexOf('{'), r.stderr.lastIndexOf('}') + 1));
    expect(json.error_type).toBe('invalid_flag_value');
    expect(json.error).toContain('invalid value for --llm');
    expect(json.hints.join(' ')).toContain('you passed: gpt-4');
  });
});

describe('help shows the flag type, not a word from its description', () => {
  // pflag reads the first back-quoted word in a usage string as the value
  // placeholder. Descriptions come from the OpenAPI spec, where backticks are
  // prose emphasis, so --instructions used to render as `--instructions Name`.
  const cases: Array<[cmd: string[], flag: string, wrong: string]> = [
    [['agent', 'update'], 'instructions', 'Name'],
    [['agent', 'update'], 'prompt', 'Name'],
    [['transcript', 'search'], 'version-param', 'environmentAlias'],
  ];

  for (const [cmd, flag, wrong] of cases) {
    it(`${cmd.join(' ')} --${flag} is labelled string, not ${wrong}`, async () => {
      const r = await run([...cmd, '--help']);
      const line = (r.stdout + r.stderr).split('\n').find((l) => l.includes(`--${flag} `));
      expect(line, `no help line for --${flag}`).toBeDefined();
      expect(line).toContain(`--${flag} string`);
      expect(line).not.toContain(`--${flag} ${wrong}`);
    });
  }

  it('keeps the description prose readable after backticks are neutralized', async () => {
    const r = await run(['agent', 'update', '--help']);
    expect(r.stdout + r.stderr).toContain("Backticked 'Name' resolves to");
  });
});
