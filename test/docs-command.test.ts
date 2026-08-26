// Tests for `vf docs` (internal/cli/docs.go). These hit the live public
// documentation site — no credentials involved.
//
// Requires the CLI binary at the repo root: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');
const $vf = (args: string[]) => execa({ reject: false, stdin: 'ignore' })(VF, args);

describe('vf docs search', () => {
  it('finds the authentication page and prints follow-up guidance', async () => {
    const result = await $vf(['docs', 'search', 'personal access token']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('api-reference/authentication');
    expect(result.stdout).toContain('vf docs get');
  });

  it('emits structured results with --output-format json', async () => {
    const result = await $vf(['docs', 'search', 'publish environment', '--output-format', 'json']);
    expect(result.exitCode, result.stderr).toBe(0);
    const results = JSON.parse(result.stdout);
    expect(Array.isArray(results)).toBe(true);
    expect(results[0]).toMatchObject({
      title: expect.any(String),
      link: expect.stringContaining('voiceflow.com/docs'),
      page: expect.any(String),
      content: expect.any(String),
    });
  });
});

describe('vf docs get', () => {
  it('prints a page as markdown, by path or full URL', async () => {
    const byPath = await $vf(['docs', 'get', 'api-reference/authentication']);
    expect(byPath.exitCode, byPath.stderr).toBe(0);
    expect(byPath.stdout).toContain('# Personal access tokens');

    const byURL = await $vf(['docs', 'get', 'https://www.voiceflow.com/docs/cli/overview']);
    expect(byURL.exitCode, byURL.stderr).toBe(0);
    expect(byURL.stdout.length).toBeGreaterThan(200);
  });

  it('teaches on a missing page', async () => {
    const result = await $vf(['docs', 'get', 'not/a/real/page']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('vf docs search');
  });

  it('refuses non-voiceflow URLs', async () => {
    const result = await $vf(['docs', 'get', 'https://example.com/docs/page']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('voiceflow.com/docs');
  });
});
