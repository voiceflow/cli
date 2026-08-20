import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSX = path.join(ROOT, 'node_modules/.bin/tsx');
const SCRIPT = path.join(ROOT, 'scripts/rewrite_docs.ts');

/** Mirrors the shape cmd/gendocs emits: one each of Synopsis, Examples and Options. */
const DOCS_PAGE = `## vf project get

Get project

### Synopsis

Get a project by ID.

\`\`\`
vf project get [flags]
\`\`\`

### Examples

\`\`\`
generated example
\`\`\`

### Options

\`\`\`
  -h, --help   help for get
\`\`\`

### Options inherited from parent commands

\`\`\`
      --token string   Voiceflow bearer token
\`\`\`

### SEE ALSO

* [vf project](vf_project.md)
`;

const spec = (cli: Record<string, unknown>, extras: Record<string, unknown> = {}) => ({
  openapi: '3.0.0',
  info: { title: 'test', version: '1.0.0' },
  paths: { '/v1/stable/project/{projectID}': { get: { 'x-vf': { cli }, ...extras, responses: {} } } },
});

describe('scripts/rewrite_docs.ts', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rewrite-docs-'));
    await fs.mkdir(path.join(cwd, 'docs'));
    await fs.writeFile(path.join(cwd, 'docs/vf_project_get.md'), DOCS_PAGE);
  });

  afterEach(() => fs.rm(cwd, { recursive: true, force: true }));

  const write = (document: unknown) => fs.writeFile(path.join(cwd, 'openapi.stable.json'), JSON.stringify(document));

  const run = () => execa(TSX, [SCRIPT], { cwd, reject: false });
  const page = () => fs.readFile(path.join(cwd, 'docs/vf_project_get.md'), 'utf-8');

  it('injects example and description into the generated page', async () => {
    await write(
      spec({ command: 'project get', example: 'vf project get --id abc', description: 'Fetches one project.' })
    );

    const result = await run();

    expect(result.exitCode).toBe(0);
    await expect(page()).resolves.toContain('vf project get --id abc');
    await expect(page()).resolves.toContain('Fetches one project.');
    await expect(page()).resolves.not.toContain('generated example');
  });

  // docs/ is produced by cmd/gendocs, which nothing in the repo runs, so this script is
  // re-applied to its own previous output. Appending instead of replacing compounds forever.
  it('is idempotent across repeated runs', async () => {
    await write(spec({ command: 'project get', example: 'vf project get', description: 'Fetches one project.' }));

    await run();
    const first = await page();
    const second = await run();

    expect(second.exitCode).toBe(0);
    await expect(page()).resolves.toBe(first);
    expect(first.match(/Fetches one project\./g)).toHaveLength(1);
  });

  it('replaces a previously injected description rather than accumulating', async () => {
    await write(spec({ command: 'project get', description: 'First.' }));
    await run();
    await write(spec({ command: 'project get', description: 'Second.' }));
    await run();

    const content = await page();
    expect(content).toContain('Second.');
    expect(content).not.toContain('First.');
  });

  // `$1`, `$&`, `$'` and `$$` are substitution directives in a String.replace replacement
  // string, and shell examples contain them routinely.
  it('preserves $ sequences in authored examples verbatim', async () => {
    const example = `vf project get | awk '{print $1}' && echo "run-$$" && printf $'\\n'`;
    await write(spec({ command: 'project get', example }));

    await run();

    await expect(page()).resolves.toContain(example);
  });

  it('skips operations Speakeasy is configured to ignore', async () => {
    await write(spec({ command: 'project get', example: 'should not appear' }, { 'x-speakeasy-ignore': true }));

    const result = await run();

    expect(result.exitCode).toBe(0);
    await expect(page()).resolves.toBe(DOCS_PAGE);
  });

  it('warns but succeeds when only some commands lack a docs page', async () => {
    await write({
      openapi: '3.0.0',
      info: { title: 'test', version: '1.0.0' },
      paths: {
        '/documented': { get: { 'x-vf': { cli: { command: 'project get', example: 'x' } }, responses: {} } },
        '/undocumented': { get: { 'x-vf': { cli: { command: 'project ghost', example: 'x' } }, responses: {} } },
      },
    });

    const result = await run();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('docs/vf_project_ghost.md');
    await expect(page()).resolves.toContain('x');
  });

  // Failing soft here would turn a completely ungenerated docs/ into a green build.
  it('fails when no enriched command has a docs page at all', async () => {
    await fs.rm(path.join(cwd, 'docs/vf_project_get.md'));
    await write(spec({ command: 'project get', example: 'x' }));

    const result = await run();

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('go run ./cmd/gendocs');
  });

  it('names the offending operation when cli metadata is malformed', async () => {
    await write(spec({ example: 'missing the command field' }));

    const result = await run();

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('GET /v1/stable/project/{projectID}');
  });

  it('rejects injected content carrying its own heading', async () => {
    await write(spec({ command: 'project get', description: 'Intro.\n### Examples\nbroken' }));

    const result = await run();

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('### ');
  });
});
