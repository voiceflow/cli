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

// Every variable that puts the CLI into agent mode. Mirrors the list in
// internal/output/agentmode.go — if that grows and this does not, a human-mode
// test running on a machine that sets the new one would silently assert against
// agent output. assertMode below is the guard against exactly that drift.
const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

/**
 * Runs vf in a known output mode.
 *
 * Human mode has to clear ALL of AGENT_ENV_VARS, not just the obvious few: CI
 * runs on GitHub, where GITHUB_COPILOT may well be set, and a stray one silently
 * flips the CLI into agent mode so the assertions check the wrong renderer.
 */
function run(args: string[], opts: { agentMode?: boolean } = {}) {
  const env: Record<string, string | undefined> = Object.fromEntries(
    AGENT_ENV_VARS.map((name) => [name, undefined]),
  );
  if (opts.agentMode) env.CLAUDECODE = '1';
  return execa({ reject: false, timeout: 20_000, stdin: 'ignore', env, extendEnv: true })(VF, args);
}

/** Fails loudly if the CLI rendered in the mode we did not ask for. */
function assertMode(stderr: string, mode: 'human' | 'agent') {
  const looksLikeAgent = stderr.trimStart().startsWith('{');
  expect(
    looksLikeAgent,
    `expected ${mode} output but got the other renderer — a new agent-detection env var is probably set and missing from AGENT_ENV_VARS:\n${stderr.slice(0, 200)}`,
  ).toBe(mode === 'agent');
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
    assertMode(r.stderr, 'human');
    expect(r.stderr).toContain('expected a JSON value');
    expect(r.stderr).toContain('you passed: gpt-4');
    expect(r.stderr).toContain(`--llm '{"key":"value"}'`);
    expect(r.stderr).toContain('--llm null');
  });

  it('emits a structured envelope in agent mode', async () => {
    const r = await run([...BASE, '--llm', 'gpt-4'], { agentMode: true });
    assertMode(r.stderr, 'agent');
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

describe('rejection messages are actionable, not circular', () => {
  // The strongest form of this test: take the CLI's own suggestion and feed it
  // back in. An earlier version hardcoded an object example for every JSON
  // destination, so on array-valued flags it told the caller to pass a value the
  // same binary rejects — following the instruction exactly reproduced the
  // identical error, with nothing new to try. For an agent that is a loop.
  const shaped: Array<[flag: string, extraArgs: string[]]> = [
    ['playbooks', []], // slice-valued  -> must suggest an array
    ['llm', []],       // map-valued    -> must suggest an object
  ];

  for (const [flag, extra] of shaped) {
    it(`--${flag}: the suggested example is one the CLI accepts`, async () => {
      const rejected = await run([...BASE, ...extra, `--${flag}`, 'not json at all']);
      const suggestion = (rejected.stderr + rejected.stdout).match(
        new RegExp(`expected shape: --${flag} '(.+)'`),
      )?.[1];
      expect(suggestion, `no shape hint offered for --${flag}`).toBeDefined();

      // Do exactly what the CLI said to do. It must not fail the same way.
      const retry = await run([...BASE, ...extra, `--${flag}`, suggestion!]);
      expect(retry.stderr, `the CLI's own suggestion ${suggestion} was rejected`).not.toContain(
        `invalid value for --${flag}`,
      );
    });
  }

  it('does not claim the input is invalid JSON when it is valid JSON', async () => {
    // '[1,2]' parses fine; it is the wrong shape for a map-valued flag. Saying
    // "not valid JSON" sends the reader to re-check syntax that was never wrong.
    const r = await run([...BASE, '--llm', '[1,2]']);
    expect(r.stderr).toContain('valid JSON but not the shape');
    expect(r.stderr).not.toContain('the value is not valid JSON');
  });

  it('surfaces what the decoder objected to, without the misleading response-body prefix', async () => {
    const r = await run([...BASE, '--llm', '[1,2]']);
    expect(r.stderr).toContain('cannot unmarshal array');
    // A flag value is a request that was never sent; there is no response body.
    expect(r.stderr).not.toContain('response body');
  });
});

describe('echoed values are bounded', () => {
  const big = 'x'.repeat(5_000);

  // The echo exists to reveal shell-quoting mistakes, so it stays — but an
  // unbounded one floods an agent's context and reproduces whatever sat inside a
  // malformed blob. Agent mode originally bypassed the cap entirely.
  for (const mode of ['human', 'agent'] as const) {
    it(`${mode} mode: a 5000-char value does not produce a 5000-char error`, async () => {
      const r = await run([...BASE, '--llm', big], { agentMode: mode === 'agent' });
      expect(r.stderr.length, `error grew with the input (${r.stderr.length} bytes)`).toBeLessThan(1_500);
      expect(r.stderr).toContain('chars)'); // says how long it really was
    });
  }

  it('counts and cuts in characters, not bytes', async () => {
    // Byte-slicing splits a multi-byte rune and misreports the length.
    const r = await run([...BASE, '--llm', 'あ'.repeat(200)]);
    expect(r.stderr).toContain('(200 chars)');
    expect(r.stderr).not.toContain('(600 chars)');
  });
});
