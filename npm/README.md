# npm distribution pipeline

This directory publishes the CLI to npm as `@voiceflow/cli` plus six platform
binary packages, so `npx @voiceflow/cli` works cold with no postinstall
scripts and no compilation. It is entirely hand-written — nothing here is
Speakeasy-generated.

## How it works

- `cli/` is the wrapper package, checked in verbatim at version `0.0.0`.
  Its `bin/vf.js` shim resolves `@voiceflow/cli-<os>-<cpu>` (installed via
  `optionalDependencies` with `os`/`cpu` fields, so npm downloads only the
  matching platform) and execs the Go binary.
- `scripts/prepare.ts` stages all seven packages into `dist/npm/` from
  goreleaser's `dist/artifacts.json`, stamping the release version everywhere.
- `scripts/publish.ts` publishes idempotently: platform packages first, a
  registry-visibility gate, wrapper last. Re-running after a partial failure
  skips what already went out.
- The `npm-publish` job in `.github/workflows/release.yaml` runs both after
  goreleaser on every `v*` tag. Versions are in lockstep with git tags by
  construction (`GITHUB_REF_NAME`).

## Invariants (breaking any of these breaks users)

1. **Every `bin` entry in `cli/package.json` must point at the same file.**
   npx only resolves `npx @voiceflow/cli` when all bin values are identical.
   `prepare.ts` enforces this at staging time.
2. **Platform binaries must be `chmod 755` at staging.** The Actions artifact
   zip round-trip drops the executable bit, and npm records file modes from
   disk into the tarball. `prepare.ts` does this; the workflow smoke-tests a
   staged binary to catch regressions.
3. **Wrapper pins platform packages with exact versions** — never ranges.
4. **Platform packages carry no `bin`, no `exports`, no `main`.** An exports
   map would block the shim's `require.resolve` of the `/bin/vf` subpath.
5. **One linux package per arch, no musl split.** The Go binaries are
   CGO-free static builds; the same package works on glibc and Alpine.
6. **Never republish or unpublish a version.** Recovery is always: fix, bump
   patch, tag again. A bad release gets `npm deprecate`, not `npm unpublish`.
7. **Prerelease versions (containing `-`) publish under the `next` dist-tag**
   so `latest` never resolves an rc. goreleaser marks them prereleases too.

## Failure recovery

- **Partial publish** (some packages live, job died): re-run the
  `npm-publish` job from the Actions UI. Existence checks make it a no-op
  for published packages; the wrapper only goes out after all six platforms
  are visible.
- **Artifact expired** (>30 days): do not rebuild-and-republish the same
  version — rebuilt binaries would not match the GitHub release. Bump patch,
  tag again.
- **Speakeasy regeneration**: `release.yaml` is generation-tracked with
  persistent edits enabled; the appended `npm-publish` job is expected to
  survive (precedent: the goreleaser naming fix did). If a regeneration ever
  drops it, move the job unchanged into its own `workflow_run`-triggered
  workflow file (needs `actions: read` and `run-id` on download-artifact).

## First-time setup (human steps)

1. npm org owner creates a granular access token: scope `@voiceflow`,
   read+write, allowed to create new packages, bypass-2FA if the org
   enforces publish-2FA. Add it as the `NPM_TOKEN` Actions secret.
2. Dry-run with a prerelease tag (e.g. `v0.NNN.0-rc.1`) — publishes under
   `next`. Verify `npx @voiceflow/cli@next version` on macOS/Linux/Windows.
3. Cut the real tag.
4. After first publish, configure npm trusted publishing (tokenless OIDC)
   for all seven packages on npmjs.com and retire `NPM_TOKEN`.
