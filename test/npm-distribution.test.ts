// Hermetic tests for the npm distribution layer (npm/): the prepare staging
// script, the publish ordering/dist-tag logic, and the wrapper bin shim.
//
// No network and no live registry: goreleaser output is simulated with fixture
// binaries, and `npm` is stubbed on PATH so publish decisions are driven by
// fixture state rather than whatever the real registry happens to serve.

import { execa } from 'execa';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const PREPARE = path.join(REPO_ROOT, 'npm', 'scripts', 'prepare.mjs');
const PUBLISH = path.join(REPO_ROOT, 'npm', 'scripts', 'publish.mjs');

const GO_TARGETS = [
  ['darwin', 'arm64'],
  ['darwin', 'amd64'],
  ['linux', 'arm64'],
  ['linux', 'amd64'],
  ['windows', 'arm64'],
  ['windows', 'amd64'],
] as const;

const NPM_SUFFIXES = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'];

let workDir: string;
let stubBinDir: string;

/**
 * Simulates a goreleaser dist dir: 6 fake binaries + artifacts.json.
 * Paths are written cwd-relative and `dist/`-prefixed, exactly as real
 * goreleaser emits them — that is the resolution branch CI depends on.
 */
function writeFixtureDist(cwd: string, { omit }: { omit?: readonly [string, string] } = {}): string {
  const distDir = path.join(cwd, 'dist');
  mkdirSync(distDir, { recursive: true });
  const artifacts: object[] = [{ name: 'checksums.txt', path: 'dist/checksums.txt', type: 'Checksum' }];
  for (const [goos, goarch] of GO_TARGETS) {
    if (omit && goos === omit[0] && goarch === omit[1]) continue;
    const relativeDir = path.join('dist', `vf_${goos}_${goarch}_v8.0`);
    mkdirSync(path.join(cwd, relativeDir), { recursive: true });
    const executable = goos === 'windows' ? 'vf.exe' : 'vf';
    const relativeBinary = path.join(relativeDir, executable);
    writeFileSync(path.join(cwd, relativeBinary), `#!/bin/sh\necho "fake-vf ${goos}/${goarch} args:$@"\nexit 0\n`);
    // Deliberately strip the exec bit, mimicking the Actions artifact zip
    // round-trip — prepare.mjs must restore it.
    chmodSync(path.join(cwd, relativeBinary), 0o644);
    artifacts.push({ name: 'vf', path: relativeBinary, type: 'Binary', goos, goarch });
  }
  writeFileSync(path.join(distDir, 'artifacts.json'), JSON.stringify(artifacts));
  return distDir;
}

/** A scratch repo root: fixture dist + a LICENSE, so prepare has what it needs. */
function makeStagingRoot(name: string, options: { license?: boolean; omit?: readonly [string, string] } = {}): string {
  const root = mkdtempSync(path.join(workDir, `${name}-`));
  mkdirSync(path.join(root, 'npm'), { recursive: true });
  cpSync(path.join(REPO_ROOT, 'npm', 'cli'), path.join(root, 'npm', 'cli'), { recursive: true });
  mkdirSync(path.join(root, 'npm', 'scripts'), { recursive: true });
  cpSync(PREPARE, path.join(root, 'npm', 'scripts', 'prepare.mjs'));
  cpSync(PUBLISH, path.join(root, 'npm', 'scripts', 'publish.mjs'));
  if (options.license !== false) writeFileSync(path.join(root, 'LICENSE'), 'Apache License, Version 2.0\n');
  writeFixtureDist(root, { omit: options.omit });
  return root;
}

async function runPrepare(root: string, version = '0.229.0') {
  return execa({ reject: false, cwd: root })('node', [
    path.join(root, 'npm', 'scripts', 'prepare.mjs'),
    '--version', version, '--dist', 'dist', '--out', 'dist/npm',
  ]);
}

/**
 * Runs publish.mjs with a stub `npm` first on PATH.
 * `published` lists exact name@version specs the fake registry already serves;
 * `latest` maps package name -> its current latest version (absent = unpublished).
 */
async function runPublish(
  root: string,
  version: string,
  registry: { published?: string[]; latest?: Record<string, string> } = {},
) {
  return execa({
    reject: false,
    cwd: root,
    env: {
      PATH: `${stubBinDir}:${process.env.PATH}`,
      FAKE_NPM_PUBLISHED: (registry.published ?? []).join(','),
      FAKE_NPM_LATEST: JSON.stringify(registry.latest ?? {}),
    },
  })('node', [path.join(root, 'npm', 'scripts', 'publish.mjs'), '--version', version, '--out', 'dist/npm', '--dry-run']);
}

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'vf-npm-test-'));

  // Stub `npm` so no test ever touches the real registry. It answers only the
  // two read shapes publish.mjs uses: `npm view <name>@<version> version` and
  // `npm view <name>@latest version`. A real `npm publish` would be a bug here
  // (the tests only run --dry-run), so the stub fails loudly on it.
  stubBinDir = path.join(workDir, 'stub-bin');
  mkdirSync(stubBinDir, { recursive: true });
  const stub = path.join(stubBinDir, 'npm');
  writeFileSync(
    stub,
    `#!/usr/bin/env node
const fs = require('node:fs');
const [command, specifier] = process.argv.slice(2);
if (command === 'publish' && process.env.FAKE_NPM_PUBLISH_LOG) {
  fs.appendFileSync(process.env.FAKE_NPM_PUBLISH_LOG, specifier + '\\n');
  process.exit(0);
}
if (command !== 'view') { console.error('stub npm: refusing ' + process.argv.slice(2).join(' ')); process.exit(90); }
const at = specifier.lastIndexOf('@');
const name = specifier.slice(0, at);
const range = specifier.slice(at + 1);
if (range === 'latest') {
  const latest = JSON.parse(process.env.FAKE_NPM_LATEST || '{}')[name];
  if (!latest) process.exit(1);
  console.log(latest);
  process.exit(0);
}
const published = (process.env.FAKE_NPM_PUBLISHED || '').split(',').filter(Boolean);
if (!published.includes(name + '@' + range)) process.exit(1);
console.log(range);
`,
  );
  chmodSync(stub, 0o755);
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('prepare.mjs', () => {
  it('stages 7 packages with stamped versions, exec bits, and embedded license', async () => {
    const root = makeStagingRoot('stage-ok');
    const result = await runPrepare(root);
    expect(result.exitCode, result.stderr).toBe(0);

    const outDir = path.join(root, 'dist', 'npm');
    for (const suffix of NPM_SUFFIXES) {
      const packageDir = path.join(outDir, `cli-${suffix}`);
      const packageJson = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
      expect(packageJson.name).toBe(`@voiceflow/cli-${suffix}`);
      expect(packageJson.version).toBe('0.229.0');
      expect(packageJson.license).toBe('Apache-2.0');
      expect(packageJson.bin).toBeUndefined();
      expect(packageJson.exports).toBeUndefined();
      expect(packageJson.preferUnplugged).toBe(true);
      expect(existsSync(path.join(packageDir, 'LICENSE')), `${suffix} must embed the license text`).toBe(true);

      const executable = suffix.startsWith('win32') ? 'vf.exe' : 'vf';
      const mode = statSync(path.join(packageDir, 'bin', executable)).mode & 0o777;
      expect(mode, `${suffix} binary must be chmod 755`).toBe(0o755);
    }

    const wrapper = JSON.parse(readFileSync(path.join(outDir, 'cli', 'package.json'), 'utf8'));
    expect(wrapper.name).toBe('@voiceflow/cli');
    expect(wrapper.version).toBe('0.229.0');
    expect(existsSync(path.join(outDir, 'cli', 'LICENSE'))).toBe(true);
    expect(new Set(Object.values(wrapper.bin)).size).toBe(1); // npx resolution invariant
    for (const pinned of Object.values(wrapper.optionalDependencies)) {
      expect(pinned).toBe('0.229.0'); // exact pins, never ranges
    }
  });

  it('refuses to stage when the repo has no LICENSE, rather than publishing a bare license claim', async () => {
    const root = makeStagingRoot('stage-nolicense', { license: false });
    const result = await runPrepare(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No LICENSE file at repo root');
    expect(existsSync(path.join(root, 'dist', 'npm', 'cli')), 'nothing may be staged').toBe(false);
  });

  it('fails loudly when a platform binary is missing', async () => {
    const root = makeStagingRoot('stage-partial', { omit: ['linux', 'arm64'] });
    const result = await runPrepare(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('linux/arm64');
  });

  it('rejects malformed versions', async () => {
    const root = makeStagingRoot('stage-badver');
    const result = await runPrepare(root, 'v0.229.0');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid or missing --version');
  });
});

describe('publish.mjs dist-tags and ordering', () => {
  it('publishes platform packages before the wrapper, tagging latest on a fresh registry', async () => {
    const root = makeStagingRoot('publish-fresh');
    expect((await runPrepare(root)).exitCode).toBe(0);

    const result = await runPublish(root, '0.229.0');
    expect(result.exitCode, result.stderr).toBe(0);

    const planned = result.stdout.split('\n').filter((line) => line.includes('[dry-run] npm publish'));
    expect(planned).toHaveLength(7);
    expect(planned[planned.length - 1]).toContain(`${path.sep}cli `); // wrapper last
    expect(planned.every((line) => line.includes('--tag latest'))).toBe(true);
  });

  it('never moves latest backwards when a recovery re-run publishes an older version', async () => {
    const root = makeStagingRoot('publish-recovery');
    expect((await runPrepare(root)).exitCode).toBe(0);

    // The registry already serves 0.230.0 as latest everywhere; an operator
    // re-runs the failed 0.229.0 job to finish its partial publish.
    const latest = Object.fromEntries([
      ['@voiceflow/cli', '0.230.0'],
      ...NPM_SUFFIXES.map((suffix) => [`@voiceflow/cli-${suffix}`, '0.230.0']),
    ]);
    const result = await runPublish(root, '0.229.0', { latest });
    expect(result.exitCode, result.stderr).toBe(0);

    const planned = result.stdout.split('\n').filter((line) => line.includes('[dry-run] npm publish'));
    expect(planned).toHaveLength(7);
    expect(planned.every((line) => line.includes('--tag previous')), 'must not demote latest').toBe(true);
    expect(result.stdout).not.toContain('--tag latest');
  });

  it('skips packages already published at this version', async () => {
    const root = makeStagingRoot('publish-partial');
    expect((await runPrepare(root)).exitCode).toBe(0);

    const result = await runPublish(root, '0.229.0', {
      published: ['@voiceflow/cli-darwin-arm64@0.229.0', '@voiceflow/cli-linux-x64@0.229.0'],
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('@voiceflow/cli-darwin-arm64@0.229.0 already published — skipping.');
    expect(result.stdout).toContain('@voiceflow/cli-linux-x64@0.229.0 already published — skipping.');
    expect(result.stdout.split('\n').filter((line) => line.includes('[dry-run] npm publish'))).toHaveLength(5);
  });

  it('still publishes the wrapper when a platform package stays unreadable (regression: v0.233.0)', async () => {
    // The real failure: the pre-publish existence check cached a 404, the
    // post-publish visibility poll kept reading that cached miss, and the run
    // aborted — leaving six platform packages published with no wrapper to
    // install them. The wrapper must go out even if the read never catches up.
    const root = makeStagingRoot('publish-invisible');
    expect((await runPrepare(root)).exitCode).toBe(0);
    const publishLog = path.join(root, 'published.txt');

    const result = await execa({
      reject: false,
      cwd: root,
      env: {
        PATH: `${stubBinDir}:${process.env.PATH}`,
        FAKE_NPM_PUBLISHED: '', // nothing ever becomes readable
        FAKE_NPM_LATEST: '{}',
        FAKE_NPM_PUBLISH_LOG: publishLog,
        VF_NPM_VISIBILITY_TIMEOUT_MS: '150', // do not wait out the real 90s
        VF_NPM_VISIBILITY_POLL_MS: '50',
      },
    })('node', [path.join(root, 'npm', 'scripts', 'publish.mjs'), '--version', '0.233.0', '--out', 'dist/npm']);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain('not readable');

    const published = readFileSync(publishLog, 'utf8').trim().split('\n');
    expect(published).toHaveLength(7);
    expect(published[published.length - 1], 'the wrapper must publish last, and must publish').toMatch(/[\\/]cli$/);
  });

  it('routes prerelease versions to the next dist-tag', async () => {
    const root = makeStagingRoot('publish-rc');
    expect((await runPrepare(root, '0.229.0-rc.1')).exitCode).toBe(0);

    const result = await runPublish(root, '0.229.0-rc.1', { latest: { '@voiceflow/cli': '0.228.0' } });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('--tag next');
    expect(result.stdout).not.toContain('--tag latest');
  });
});

describe('bin shim (vf.js)', () => {
  function stageShimInstall(binaryContent: string): string {
    const installDir = mkdtempSync(path.join(workDir, 'shim-install-'));
    const shimDir = path.join(installDir, 'node_modules', '@voiceflow', 'cli');
    cpSync(path.join(REPO_ROOT, 'npm', 'cli'), shimDir, { recursive: true });

    const platformDir = path.join(installDir, 'node_modules', '@voiceflow', `cli-${process.platform}-${process.arch}`);
    mkdirSync(path.join(platformDir, 'bin'), { recursive: true });
    writeFileSync(path.join(platformDir, 'package.json'), JSON.stringify({ name: `@voiceflow/cli-${process.platform}-${process.arch}`, version: '0.0.0' }));
    const binary = path.join(platformDir, 'bin', 'vf');
    writeFileSync(binary, binaryContent);
    chmodSync(binary, 0o755);
    return path.join(shimDir, 'bin', 'vf.js');
  }

  it('spawns the platform binary, forwards args, and propagates the exit code', async () => {
    const shim = stageShimInstall('#!/bin/sh\necho "argv:$@"\nexit 42\n');
    const result = await execa({ reject: false })('node', [shim, 'workspace', 'list', '--output-format', 'json']);
    expect(result.stdout).toBe('argv:workspace list --output-format json');
    expect(result.exitCode).toBe(42);
  });

  it('propagates signal death as signal death, not a plain exit code', async () => {
    const shim = stageShimInstall('#!/bin/sh\nkill -TERM $$\n');
    const result = await execa({ reject: false })('node', [shim]);
    expect(result.signal ?? result.exitCode).not.toBe(0);
  });

  it('prints a teaching error when the platform package is missing', async () => {
    const installDir = mkdtempSync(path.join(workDir, 'shim-missing-'));
    const shimDir = path.join(installDir, 'node_modules', '@voiceflow', 'cli');
    cpSync(path.join(REPO_ROOT, 'npm', 'cli'), shimDir, { recursive: true });

    const result = await execa({ reject: false })('node', [path.join(shimDir, 'bin', 'vf.js'), 'version']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`@voiceflow/cli-${process.platform}-${process.arch}`);
    expect(result.stderr).toContain('optionalDependenc');
    expect(result.stderr).toContain('https://github.com/voiceflow/cli/releases');
  });
});
