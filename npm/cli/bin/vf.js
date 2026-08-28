#!/usr/bin/env node
'use strict';
// Launcher for the Voiceflow CLI (vf).
//
// The real CLI is a Go binary shipped in a platform-specific package
// (@voiceflow/cli-<os>-<cpu>) installed as an optionalDependency of
// @voiceflow/cli. This shim resolves the right binary and hands over.
//
// INVARIANT: every entry in this package's "bin" map must point at this
// same file — npx only resolves `npx @voiceflow/cli` when all bin values
// are identical (npm/libnpmexec checks that before the name match).

const { spawn } = require('node:child_process');

const platformKey = `${process.platform}-${process.arch}`;
const SUPPORTED_PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
];

function fail(lines) {
  console.error(lines.join('\n'));
  process.exit(1);
}

if (!SUPPORTED_PLATFORMS.includes(platformKey)) {
  fail([
    `The Voiceflow CLI does not ship a prebuilt binary for your platform (${platformKey}).`,
    `Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}.`,
    'Binaries for other platforms may be available at:',
    '  https://github.com/voiceflow/cli/releases',
  ]);
}

const executableName = process.platform === 'win32' ? 'vf.exe' : 'vf';
let binaryPath;
try {
  binaryPath = require.resolve(`@voiceflow/cli-${platformKey}/bin/${executableName}`);
} catch {
  fail([
    `Could not find the Voiceflow CLI binary package "@voiceflow/cli-${platformKey}".`,
    'It is installed automatically as an optionalDependency of @voiceflow/cli.',
    'This usually means optional dependencies were skipped (npm --omit=optional,',
    'yarn --ignore-optional) or the lockfile was created on a different platform.',
    'Reinstall without those flags, or download a binary directly:',
    '  https://github.com/voiceflow/cli/releases',
  ]);
}

const child = spawn(binaryPath, process.argv.slice(2), { stdio: 'inherit' });

// Terminal-generated SIGINT reaches the child directly through the shared
// process group, so the shim only ignores it and waits. SIGTERM/SIGHUP are
// delivered to the shim alone, so those are forwarded.
process.on('SIGINT', () => {});
for (const signal of ['SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  fail([`Failed to start ${binaryPath}: ${error.message}`]);
});

child.on('close', (code, signal) => {
  if (signal) {
    // Die by the same signal so callers observe the real termination reason.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
