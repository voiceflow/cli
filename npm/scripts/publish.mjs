// Publishes the staged npm packages for a release. Idempotent: every publish
// is preceded by an existence check, so re-running after a partial failure
// skips what already went out and finishes the rest.
//
// Ordering is load-bearing: the six platform packages publish first, then a
// visibility poll confirms the registry serves all of them, and only then the
// wrapper publishes — so no user can ever install a wrapper whose exact-pinned
// optionalDependencies do not resolve.
//
// The `latest` dist-tag is only moved forward: a re-run recovering an older
// version never demotes `latest` below what the registry already serves.
// Prerelease versions (containing "-") always publish under "next".
//
// Dependency-free ESM run by bare `node` — no tsx, no transitive packages, so
// nothing from the registry executes in this token-bearing step. Node >= 18.
//
// Usage: node npm/scripts/publish.mjs --version 0.229.0 --out dist/npm [--dry-run]

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
const outDir = path.resolve(args.out);
const isDryRun = args['dry-run'];
const isPrerelease = version.includes('-');

const PLATFORM_SUFFIXES = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'];
const platformPackages = PLATFORM_SUFFIXES.map((suffix) => ({
  name: `@voiceflow/cli-${suffix}`,
  dir: path.join(outDir, `cli-${suffix}`),
}));
const wrapperPackage = { name: '@voiceflow/cli', dir: path.join(outDir, 'cli') };

for (const pkg of [...platformPackages, wrapperPackage]) {
  if (!existsSync(path.join(pkg.dir, 'package.json'))) {
    console.error(`Missing staged package at ${pkg.dir} — run npm/scripts/prepare.mjs first.`);
    process.exit(1);
  }
}

function npmView(specifier, field) {
  try {
    return execFileSync('npm', ['view', specifier, field], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
      .toString()
      .trim();
  } catch {
    return null; // not published / no packument / field absent
  }
}

function isPublished(name) {
  return npmView(`${name}@${version}`, 'version') === version;
}

// Compare two semver core versions (ignoring prerelease/build): is `a` strictly
// greater than `b`? Used only to decide whether `latest` may move to `version`.
function coreIsGreater(a, b) {
  const core = (v) => v.split('-')[0].split('.').map(Number);
  const [a1, a2, a3] = core(a);
  const [b1, b2, b3] = core(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

// A stable release tags `latest` only when it is newer than the registry's
// current latest; otherwise it publishes under a non-floating "previous" tag so
// a recovery re-run of an older version never demotes what users install.
function distTagFor(pkgName) {
  if (isPrerelease) return 'next';
  const currentLatest = npmView(`${pkgName}@latest`, 'version');
  if (currentLatest && !coreIsGreater(version, currentLatest)) return 'previous';
  return 'latest';
}

function publish(pkg) {
  if (isPublished(pkg.name)) {
    console.log(`${pkg.name}@${version} already published — skipping.`);
    return;
  }
  const distTag = distTagFor(pkg.name);
  const publishArgs = ['publish', pkg.dir, '--access', 'public', '--provenance', '--tag', distTag];
  if (isDryRun) {
    console.log(`[dry-run] npm ${publishArgs.join(' ')}`);
    return;
  }
  console.log(`Publishing ${pkg.name}@${version} (tag: ${distTag})...`);
  execFileSync('npm', publishArgs, { stdio: 'inherit', timeout: 300_000 });
}

async function waitUntilVisible(name) {
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

console.log(isDryRun ? 'Dry run complete.' : `Published @voiceflow/cli@${version} and 6 platform packages.`);
