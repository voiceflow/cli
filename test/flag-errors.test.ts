// Tests for how flag failures are REPORTED, and how help describes a flag.
//
// Three things ship together here because they are one experience: what you see
// when a flag value is wrong.
//
//   1. The message names the shape, shows an example, and keeps the decoder's
//      own explanation instead of discarding it.
//   2. What it echoes back is bounded.
//   3. Help shows the flag's real type, not a word borrowed from its prose.
//
// Parsing behaviour is unchanged: every value accepted before is accepted now,
// and every value rejected before is still rejected. Only the message differs.
//
// Every case runs the real binary with --dry-run, so nothing here touches the
// network. Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

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

describe('nullability is unaffected', () => {
  // These fields are JSON-typed precisely so that null can be expressed. Both
  // hold on master and must keep holding: they are the reason the encoding is
  // what it is, and the constraint any future relaxation has to respect.
  it('--instructions null still sends a real JSON null', async () => {
    const r = await run([...BASE, '--instructions', 'null']);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('null');
  });

  it('an explicitly quoted JSON string is passed through unchanged', async () => {
    const r = await run([...BASE, '--instructions', '"already json"']);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('"already json"');
  });
});

describe('a string-valued flag accepts prose directly', () => {
  // In the errors-only PR this flag rejected prose and the test asserted that
  // the error said how to quote it. The raw-text fallback removes the rejection,
  // so what is pinned here is the behaviour that replaced it. The quoting
  // example still exists for the flags the fallback does not cover.
  it('takes prose without JSON quoting', async () => {
    const r = await run([...BASE, '--instructions', 'You are a support agent.']);
    expect(r.exitCode).toBe(0);
    expect(sent(r.stderr + r.stdout, 'instructions')).toBe('"You are a support agent."');
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

/** Collapses whitespace runs, since help indents a description's later lines. */
const squash = (text: string) => text.replace(/\s+/g, ' ');

/** The escapes a KDL string can hold, beyond \u{...}. */
const KDL_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', s: ' ', '"': '"', '\\': '\\', '/': '/' };

/** Decodes a KDL string body, including \u{...}, which JSON.parse rejects. */
function unescapeKDL(raw: string): string {
  return raw.replace(/\\(?:u\{([0-9a-fA-F]{1,6})\}|(.))/g, (escape, hex?: string, char?: string) =>
    hex !== undefined ? String.fromCodePoint(parseInt(hex, 16)) : (KDL_ESCAPES[char ?? ''] ?? escape));
}

/** Matches the start of any flag's entry in --help. */
const FLAG_ENTRY = /^\s+(?:-\w, )?--[\w-]/;

/**
 * One flag's own entry in --help: its line, and the lines its description
 * wraps onto, up to the next flag or the end of the section.
 */
function helpEntry(help: string, name: string): string | undefined {
  const lines = help.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^\\s+(?:-\\w, )?--${name}(?=\\s|$)`).test(line));
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end]!) && !FLAG_ENTRY.test(lines[end]!)) end += 1;
  return lines.slice(start, end).join('\n');
}

/**
 * The labels pflag gives a flag's value: its type, renamed for a few kinds.
 * A boolean has none. A label outside this list is a word lifted from the
 * description.
 */
const TYPE_LABELS = new Set(['string', 'stringArray', 'strings', 'int', 'ints', 'uint', 'uints', 'float', 'duration', 'bools']);

/** A flag whose description, as the spec wrote it, uses backticks. */
interface BacktickedFlag {
  command: string[];
  name: string;
  description: string;
}

/**
 * Every flag whose description uses backticks, read from `vf --usage`: the KDL
 * schema keeps each description exactly as the spec wrote it, where --help
 * shows it after the CLI has rewritten it.
 */
async function backtickedFlags(): Promise<BacktickedFlag[]> {
  const { stdout } = await run(['--usage']);
  const flags: BacktickedFlag[] = [];
  const blocks: Array<string | null> = []; // one per open { }, null when it is not a command
  for (const line of stdout.split('\n')) {
    if (/^\s*\}\s*$/.test(line)) {
      blocks.pop();
      continue;
    }
    const flag = line.match(/^\s*flag "[^"]*--([\w-]+)[^"]*" help="((?:[^"\\]|\\.)*)"/);
    const [, name, help] = flag ?? [];
    if (name && help?.includes('`')) {
      flags.push({
        command: blocks.filter((block): block is string => block !== null),
        name,
        description: unescapeKDL(help),
      });
    }
    if (/\{\s*$/.test(line)) blocks.push(line.match(/^\s*cmd "([^"]+)"/)?.[1] ?? null);
  }
  return flags;
}

describe('help shows the flag type, not a word from its description', () => {
  // pflag reads the first back-quoted word in a usage string as the value
  // placeholder, and strips that pair of backticks from the prose. Descriptions
  // come from the OpenAPI spec, where backticks are emphasis, so flags rendered
  // as `--version-param environmentAlias` with the quotes gone from the sentence.
  //
  // The flags come from `vf --usage` rather than a hand-picked list. The list
  // went stale on a regeneration: the spec dropped the backticks from its
  // flags' descriptions, and its checks kept passing on flags that no longer had
  // anything to check.
  let flags: BacktickedFlag[] = [];

  beforeAll(async () => {
    flags = await backtickedFlags();
  });

  it('finds flags whose descriptions use backticks', () => {
    // Zero would leave the next case passing without checking anything. If the
    // spec really has stopped using backticks, this block can go.
    expect(flags.length).toBeGreaterThan(0);
  });

  it('labels every one of them by its type and keeps its backticks as quotes', async () => {
    // Each flag is checked against its own entry in --help, so a flag cannot
    // pass on another flag's text. Had pflag lifted a word, the label would be
    // that word, and the word would appear bare in the sentence.
    const commands = [...new Set(flags.map((flag) => flag.command.join(' ')))];
    const helps = new Map(await Promise.all(commands.map(async (command) => {
      const { stdout, stderr } = await run([...command.split(' ').filter(Boolean), '--help']);
      return [command, stdout + stderr] as const;
    })));

    const problems: string[] = [];
    for (const { command, name, description } of flags) {
      const entry = helpEntry(helps.get(command.join(' ')) ?? '', name);
      const where = `vf ${command.join(' ')} --${name}`;
      if (entry === undefined) {
        problems.push(`${where}: no help entry`);
        continue;
      }
      // The label runs to the gap before the description; a lifted one can hold
      // spaces, as in "{ key, values }".
      const label = entry.match(new RegExp(`--${name}(?: (\\S.*?))?(?:\\s{2,}|$)`, 'm'))?.[1];
      if (label !== undefined && !TYPE_LABELS.has(label)) {
        problems.push(`${where}: labelled "${label}"`);
      }
      if (!squash(entry).includes(squash(description.replaceAll('`', "'")))) {
        problems.push(`${where}: description changed: ${squash(entry).trim()}`);
      }
    }
    expect(problems).toEqual([]);
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
