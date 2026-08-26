// Hermetic tests for the npm distribution layer (npm/): the prepare staging
// script and the wrapper bin shim. No network, no live API — goreleaser
// output is simulated with fixture binaries.

import { execa } from 'execa';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const PREPARE = path.join(REPO_ROOT, 'npm', 'scripts', 'prepare.ts');
const PUBLISH = path.join(REPO_ROOT, 'npm', 'scripts', 'publish.ts');
const SHIM = path.join(REPO_ROOT, 'npm', 'cli', 'bin', 'vf.js');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

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

/** Simulates a goreleaser dist dir: 6 fake binaries + artifacts.json. */
function writeFixtureDist(distDir: string, { omit }: { omit?: readonly [string, string] } = {}): void {
  const artifacts: object[] = [{ name: 'checksums.txt', path: path.join(distDir, 'checksums.txt'), type: 'Checksum' }];
  for (const [goos, goarch] of GO_TARGETS) {
    if (omit && goos === omit[0] && goarch === omit[1]) continue;
    const dir = path.join(distDir, `vf_${goos}_${goarch}`);
    mkdirSync(dir, { recursive: true });
    const binary = path.join(dir, goos === 'windows' ? 'vf.exe' : 'vf');
    writeFileSync(binary, `#!/bin/sh\necho "fake-vf ${goos}/${goarch} args:$@"\nexit 0\n`);
    // Deliberately strip the exec bit, mimicking the Actions artifact zip
    // round-trip — prepare.ts must restore it.
    chmodSync(binary, 0o644);
    artifacts.push({ name: 'vf', path: binary, type: 'Binary', goos, goarch });
  }
  writeFileSync(path.join(distDir, 'artifacts.json'), JSON.stringify(artifacts));
}

async function runPrepare(distDir: string, outDir: string, version = '0.229.0') {
  return execa({ reject: false })(TSX, [PREPARE, '--version', version, '--dist', distDir, '--out', outDir]);
}

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'vf-npm-test-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('prepare.ts', () => {
  it('stages 7 packages with stamped versions, exec bits, and license metadata', async () => {
    const distDir = path.join(workDir, 'dist-ok');
    const outDir = path.join(workDir, 'out-ok');
    writeFixtureDist(distDir);

    const result = await runPrepare(distDir, outDir);
    expect(result.exitCode, result.stderr).toBe(0);

    for (const suffix of NPM_SUFFIXES) {
      const packageJson = JSON.parse(readFileSync(path.join(outDir, `cli-${suffix}`, 'package.json'), 'utf8'));
      expect(packageJson.name).toBe(`@voiceflow/cli-${suffix}`);
      expect(packageJson.version).toBe('0.229.0');
      expect(packageJson.license).toBe('Apache-2.0');
      expect(packageJson.bin).toBeUndefined();
      expect(packageJson.exports).toBeUndefined();
      expect(packageJson.preferUnplugged).toBe(true);

      const executable = suffix.startsWith('win32') ? 'vf.exe' : 'vf';
      const mode = statSync(path.join(outDir, `cli-${suffix}`, 'bin', executable)).mode & 0o777;
      expect(mode, `${suffix} binary must be chmod 755`).toBe(0o755);
    }

    const wrapper = JSON.parse(readFileSync(path.join(outDir, 'cli', 'package.json'), 'utf8'));
    expect(wrapper.name).toBe('@voiceflow/cli');
    expect(wrapper.version).toBe('0.229.0');
    expect(new Set(Object.values(wrapper.bin)).size).toBe(1); // npx resolution invariant
    for (const pinned of Object.values(wrapper.optionalDependencies)) {
      expect(pinned).toBe('0.229.0'); // exact pins, never ranges
    }
  });

  it('fails loudly when a platform binary is missing', async () => {
    const distDir = path.join(workDir, 'dist-partial');
    const outDir = path.join(workDir, 'out-partial');
    writeFixtureDist(distDir, { omit: ['linux', 'arm64'] });

    const result = await runPrepare(distDir, outDir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('linux/arm64');
  });

  it('rejects malformed versions', async () => {
    const distDir = path.join(workDir, 'dist-ok');
    const result = await runPrepare(distDir, path.join(workDir, 'out-badver'), 'v0.229.0');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid or missing --version');
  });
});

describe('publish.ts --dry-run', () => {
  it('plans platform packages before the wrapper and never invokes a real publish', async () => {
    const outDir = path.join(workDir, 'out-ok'); // staged by the first test
    const result = await execa({ reject: false })(TSX, [PUBLISH, '--version', '0.229.0', '--out', outDir, '--dry-run']);
    expect(result.exitCode, result.stderr).toBe(0);

    const planned = result.stdout.split('\n').filter((line) => line.includes('[dry-run] npm publish'));
    expect(planned).toHaveLength(7);
    expect(planned[planned.length - 1]).toContain(`${path.sep}cli `); // wrapper last
    expect(result.stdout).toContain('--tag latest');
  });

  it('routes prerelease versions to the next dist-tag', async () => {
    const distDir = path.join(workDir, 'dist-ok');
    const outDir = path.join(workDir, 'out-rc');
    await runPrepare(distDir, outDir, '0.229.0-rc.1');

    const result = await execa({ reject: false })(TSX, [PUBLISH, '--version', '0.229.0-rc.1', '--out', outDir, '--dry-run']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('--tag next');
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
