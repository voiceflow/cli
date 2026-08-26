// Stages the npm packages for a release into an output directory.
//
// Reads goreleaser's dist/artifacts.json to locate the six built binaries
// (never guesses goreleaser's per-target directory names), then writes:
//
//   <out>/cli-<os>-<cpu>/   one package per platform, binary at bin/vf[.exe]
//   <out>/cli/              the wrapper package, copied from npm/cli/
//
// with every package.json stamped to the release version. Publishing is a
// separate, side-effectful step: npm/scripts/publish.ts.
//
// Usage: tsx npm/scripts/prepare.ts --version 0.229.0 --dist dist --out dist/npm

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { parseArgs } from 'node:util';

interface GoreleaserArtifact {
  name: string;
  path: string;
  type: string;
  goos?: string;
  goarch?: string;
}

interface PlatformTarget {
  goos: string;
  goarch: string;
  npmOs: string;
  npmCpu: string;
  executableName: string;
}

const PLATFORM_TARGETS: PlatformTarget[] = [
  { goos: 'darwin', goarch: 'arm64', npmOs: 'darwin', npmCpu: 'arm64', executableName: 'vf' },
  { goos: 'darwin', goarch: 'amd64', npmOs: 'darwin', npmCpu: 'x64', executableName: 'vf' },
  { goos: 'linux', goarch: 'arm64', npmOs: 'linux', npmCpu: 'arm64', executableName: 'vf' },
  { goos: 'linux', goarch: 'amd64', npmOs: 'linux', npmCpu: 'x64', executableName: 'vf' },
  { goos: 'windows', goarch: 'arm64', npmOs: 'win32', npmCpu: 'arm64', executableName: 'vf.exe' },
  { goos: 'windows', goarch: 'amd64', npmOs: 'win32', npmCpu: 'x64', executableName: 'vf.exe' },
];

const { values: args } = parseArgs({
  options: {
    version: { type: 'string' },
    dist: { type: 'string', default: 'dist' },
    out: { type: 'string', default: 'dist/npm' },
  },
});

const version = args.version;
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid or missing --version (got: ${JSON.stringify(version)}). Expected e.g. 0.229.0 or 0.229.0-rc.1.`);
  process.exit(1);
}
const distDir = path.resolve(args.dist!);
const outDir = path.resolve(args.out!);
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const wrapperSourceDir = path.join(repoRoot, 'npm', 'cli');
const licensePath = path.join(repoRoot, 'LICENSE');

const artifactsPath = path.join(distDir, 'artifacts.json');
if (!existsSync(artifactsPath)) {
  console.error(`Missing ${artifactsPath} — run goreleaser first (or pass --dist).`);
  process.exit(1);
}
const artifacts: GoreleaserArtifact[] = JSON.parse(readFileSync(artifactsPath, 'utf8'));
const binaries = artifacts.filter((artifact) => artifact.type === 'Binary');

function findBinary(target: PlatformTarget): string {
  const match = binaries.find((binary) => binary.goos === target.goos && binary.goarch === target.goarch);
  if (!match) {
    console.error(`No built binary found for ${target.goos}/${target.goarch} in ${artifactsPath}.`);
    console.error(`Binaries present: ${binaries.map((binary) => `${binary.goos}/${binary.goarch}`).join(', ') || 'none'}`);
    process.exit(1);
  }
  const binaryPath = path.isAbsolute(match.path) ? match.path : path.join(distDir, '..', match.path);
  // goreleaser records paths relative to the working directory (dist/...);
  // resolve against cwd first, then distDir's parent as a fallback.
  const candidates = [path.resolve(match.path), binaryPath];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error(`Binary listed in artifacts.json does not exist on disk: ${match.path}`);
    process.exit(1);
  }
  return found;
}

function writePlatformPackage(target: PlatformTarget): string {
  const packageName = `@voiceflow/cli-${target.npmOs}-${target.npmCpu}`;
  const packageDir = path.join(outDir, `cli-${target.npmOs}-${target.npmCpu}`);
  const binDir = path.join(packageDir, 'bin');
  mkdirSync(binDir, { recursive: true });

  const sourceBinary = findBinary(target);
  const stagedBinary = path.join(binDir, target.executableName);
  copyFileSync(sourceBinary, stagedBinary);
  // Load-bearing: the Actions artifact zip round-trip drops the executable
  // bit, and npm records file modes from disk into the published tarball.
  chmodSync(stagedBinary, 0o755);

  writeFileSync(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify(
      {
        name: packageName,
        version,
        description: `Voiceflow CLI binary for ${target.npmOs} ${target.npmCpu}. Install @voiceflow/cli instead of this package.`,
        license: 'Apache-2.0',
        repository: { type: 'git', url: 'git+https://github.com/voiceflow/cli.git' },
        os: [target.npmOs],
        cpu: [target.npmCpu],
        files: ['bin/'],
        preferUnplugged: true,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(packageDir, 'README.md'),
    `# ${packageName}\n\nPrebuilt Voiceflow CLI binary for ${target.npmOs} ${target.npmCpu}. Install [@voiceflow/cli](https://www.npmjs.com/package/@voiceflow/cli) instead of depending on this package directly.\n`,
  );
  copyLicenseInto(packageDir);
  return packageDir;
}

function writeWrapperPackage(): string {
  const packageDir = path.join(outDir, 'cli');
  cpSync(wrapperSourceDir, packageDir, { recursive: true });

  const packageJsonPath = path.join(packageDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = version;
  for (const dependencyName of Object.keys(packageJson.optionalDependencies)) {
    packageJson.optionalDependencies[dependencyName] = version;
  }

  // npx resolves `npx @voiceflow/cli` only while every bin value is the same
  // file (npm/libnpmexec checks this before the package-name match).
  const binTargets = new Set(Object.values(packageJson.bin));
  if (binTargets.size !== 1) {
    console.error('Wrapper "bin" entries must all point at the same file — npx resolution depends on it.');
    process.exit(1);
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  copyLicenseInto(packageDir);
  return packageDir;
}

function copyLicenseInto(packageDir: string): void {
  if (existsSync(licensePath)) {
    copyFileSync(licensePath, path.join(packageDir, 'LICENSE'));
  } else {
    console.warn('Warning: no LICENSE file at repo root — published packages will not embed one.');
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const stagedDirs = PLATFORM_TARGETS.map((target) => writePlatformPackage(target));
stagedDirs.push(writeWrapperPackage());

console.log(`Staged ${stagedDirs.length} packages at version ${version}:`);
for (const dir of stagedDirs) console.log(`  ${path.relative(process.cwd(), dir)}`);
