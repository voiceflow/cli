// Publishes the staged npm packages for a release. Idempotent: every publish
// is preceded by an existence check, so re-running after a partial failure
// skips what already went out and finishes the rest.
//
// Ordering is load-bearing: the six platform packages publish first, then a
// visibility poll confirms the registry serves all of them, and only then the
// wrapper publishes — so no user can ever install a wrapper whose exact-pinned
// optionalDependencies do not resolve.
//
// Prerelease versions (anything containing "-") publish under the "next"
// dist-tag so `npx @voiceflow/cli` (implicit latest) never resolves an rc.
//
// Usage: tsx npm/scripts/publish.ts --version 0.229.0 --out dist/npm [--dry-run]

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    version: { type: 'string' },
    out: { type: 'string', default: 'dist/npm' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const version = args.version;
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid or missing --version (got: ${JSON.stringify(version)}).`);
  process.exit(1);
}
const outDir = path.resolve(args.out!);
const isDryRun = args['dry-run']!;
const distTag = version.includes('-') ? 'next' : 'latest';

const PLATFORM_SUFFIXES = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'];
const platformPackages = PLATFORM_SUFFIXES.map((suffix) => ({
  name: `@voiceflow/cli-${suffix}`,
  dir: path.join(outDir, `cli-${suffix}`),
}));
const wrapperPackage = { name: '@voiceflow/cli', dir: path.join(outDir, 'cli') };

for (const pkg of [...platformPackages, wrapperPackage]) {
  if (!existsSync(path.join(pkg.dir, 'package.json'))) {
    console.error(`Missing staged package at ${pkg.dir} — run npm/scripts/prepare.ts first.`);
    process.exit(1);
  }
}

function isPublished(name: string): boolean {
  try {
    execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

function publish(pkg: { name: string; dir: string }): void {
  if (isPublished(pkg.name)) {
    console.log(`${pkg.name}@${version} already published — skipping.`);
    return;
  }
  const publishArgs = ['publish', pkg.dir, '--access', 'public', '--provenance', '--tag', distTag];
  if (isDryRun) {
    console.log(`[dry-run] npm ${publishArgs.join(' ')}`);
    return;
  }
  console.log(`Publishing ${pkg.name}@${version} (tag: ${distTag})...`);
  execFileSync('npm', publishArgs, { stdio: 'inherit', timeout: 300_000 });
}

async function waitUntilVisible(name: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (isPublished(name)) return;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  console.error(`${name}@${version} still not visible on the registry after 90s — aborting before the wrapper publish.`);
  console.error('Re-run this job once the registry catches up; already-published packages are skipped.');
  process.exit(1);
}

for (const pkg of platformPackages) publish(pkg);

if (!isDryRun) {
  for (const pkg of platformPackages) await waitUntilVisible(pkg.name);
}

publish(wrapperPackage);

console.log(isDryRun ? 'Dry run complete.' : `Published @voiceflow/cli@${version} and 6 platform packages (tag: ${distTag}).`);
