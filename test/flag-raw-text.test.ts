// Tests for the raw-text fallback: JSON-typed flags whose destination is a Go
// string accept prose without JSON quoting.
//
// The two assertions this change lives or dies on are at the bottom: the wire
// payload is unchanged, and union fields (Markup, when this was written) are
// untouched. Both were raised in review and both are pinned here rather than
// argued.
//
// Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

const BASE = ['agent', 'update', '--project-id', 'p', '--environment-alias', 'main', '--dry-run', '--token', 'vfp_x'];

const AGENT_ENV_VARS = [
  'CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT', 'CODEX', 'AIDER', 'CLINE',
  'WINDSURF_AGENT', 'GITHUB_COPILOT', 'AMAZON_Q', 'GEMINI_CODE_ASSIST',
  'SRC_CODY', 'FORCE_AGENT_MODE',
];

function run(args: string[], opts: { agentMode?: boolean } = {}) {
  const env: Record<string, string | undefined> = Object.fromEntries(
    AGENT_ENV_VARS.map((name) => [name, undefined]),
  );
  if (opts.agentMode) env.CLAUDECODE = '1';
  return execa({ reject: false, timeout: 20_000, stdin: 'ignore', env, extendEnv: true })(VF, args);
}

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

describe('the fallback changes encoding, not types', () => {
  // Raised in review: that this makes Markup fields accept a string, and so
  // belongs at the API level. Neither half holds, and both are checked here
  // rather than asserted in a comment.

  it('produces the same bytes as the JSON-quoted form', async () => {
    const raw = await run([...BASE, '--instructions', 'You are a support agent.']);
    const quoted = await run([...BASE, '--instructions', '"You are a support agent."']);
    const a = sent(raw.stderr + raw.stdout, 'instructions');
    expect(a, 'raw text did not reach the body').toBe('"You are a support agent."');
    expect(a, 'the two input forms disagree on the wire').toBe(sent(quoted.stderr + quoted.stdout, 'instructions'));
  });

  // --filters on transcript search is []components.TranscriptFilterUnion, a list
  // of unions: the shape --url on mcp-server create had as []components.Markup
  // until a regeneration made that field a plain string. A list is not a
  // string, so the fallback never runs and raw text is still an error.
  //
  // The sharper case, a union with a string member that is not in a list, would
  // decode quoted text if the fallback ever ran on it. No flag has that shape
  // today, so internal/flagutil/stringvalue_test.go pins it on types the spec
  // cannot change.
  it('leaves union-valued flags strict', async () => {
    const r = await run([
      'transcript', 'search', '--project-id', 'p', '--environment-alias', 'main',
      '--dry-run', '--token', 'vfp_x', '--filters', 'not json',
    ]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr, 'a union field accepted raw text').toContain('invalid value for --filters');
  });
});
