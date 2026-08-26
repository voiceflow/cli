# Voiceflow CLI

`vf` is the command line for [Voiceflow](https://www.voiceflow.com), the AI agent platform for customer experience automation. Manage agents, knowledge bases, workflows, tests, and transcripts from your terminal or CI.

## Install

```bash
# Run without installing
npx @voiceflow/cli --help

# Or install globally (provides both `vf` and `voiceflow`)
npm install -g @voiceflow/cli
```

This package installs a prebuilt binary for your platform via an optional dependency (`@voiceflow/cli-<os>-<cpu>`). No postinstall scripts, no compilation.

## Authenticate

Create a personal access token in Voiceflow under **Settings → Access tokens** (tokens start with `vfp_`), then:

```bash
export VF_TOKEN=vfp_...
```

Every command also accepts `--token`.

## First conversation in four commands

```bash
vf workspace list --output-format json                       # -> .workspaces[].id
vf project create --name "My Agent" --type webchat \
  --workspace-id $WORKSPACE_ID --output-format json          # -> .project.id
vf conversation send --user-id demo-user --project-id $PROJECT_ID \
  --environment-alias main --version-param draft \
  --action '{"type":"launch"}' --output-format json
vf conversation send --user-id demo-user --project-id $PROJECT_ID \
  --environment-alias main --version-param draft \
  --action '{"type":"text","payload":"What can you do?"}' --output-format json
```

## Docs

- CLI documentation: https://www.voiceflow.com/docs/cli/overview
- Authentication: https://www.voiceflow.com/docs/api-reference/authentication
- Source and prebuilt binaries: https://github.com/voiceflow/cli

## Supported platforms

macOS (arm64, x64), Linux (arm64, x64 — glibc and musl), Windows (arm64, x64). Other platforms can use the binaries on the [releases page](https://github.com/voiceflow/cli/releases) or `go install github.com/voiceflow/cli/cmd/vf@latest`.
