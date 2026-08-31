# vf

The Voiceflow CLI. Build, test, and operate AI agents on [Voiceflow](https://www.voiceflow.com), the AI agent platform for customer experience automation — from your terminal, your CI, or your coding agent.

`vf` covers the full agent lifecycle: workspaces, projects, environments, playbooks, functions, knowledge base documents, conversations, tests, evaluations, transcripts, and analytics. Every read command speaks JSON (and [TOON](https://github.com/toon-format/spec)); every failure names its own fix.

[![Built by Speakeasy](https://img.shields.io/badge/Built_by-SPEAKEASY-374151?style=for-the-badge&labelColor=f3f4f6)](https://www.speakeasy.com/?utm_source=github-com/voiceflow/cli&utm_campaign=cli)
[![License: Apache-2.0](https://img.shields.io/badge/LICENSE_//_Apache--2.0-3b5bdb?style=for-the-badge&labelColor=eff6ff)](https://opensource.org/license/Apache-2.0)

<!-- Start Summary [summary] -->
## Summary

Realtime: Realtime gateway API service
<!-- End Summary [summary] -->

<!-- Start Table of Contents [toc] -->
## Table of Contents
<!-- $toc-max-depth=2 -->
* [vf](#vf)
  * [CLI Installation](#cli-installation)
  * [Quickstart: zero to a talking agent](#quickstart-zero-to-a-talking-agent)
  * [Shell Completion](#shell-completion)
  * [CLI Example Usage](#cli-example-usage)
  * [Authentication](#authentication)
  * [Available Commands](#available-commands)
  * [Request Body Input](#request-body-input)
  * [Server Selection](#server-selection)
  * [Output Formats](#output-formats)
  * [Error Handling](#error-handling)
  * [Diagnostics](#diagnostics)
* [Development](#development)
  * [Maturity](#maturity)
  * [Contributions](#contributions)

<!-- End Table of Contents [toc] -->

## CLI Installation

### npm

```bash
# Run without installing
npx -y @voiceflow/cli --help

# Or install globally (provides both `vf` and `voiceflow`)
npm install -g @voiceflow/cli
```

Installs a prebuilt binary for your platform (macOS, Linux, Windows — arm64 and x64) with no postinstall scripts and no compilation.

### Quick Install (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/voiceflow/cli/HEAD/scripts/install.sh | bash
```

### Quick Install (Windows PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/voiceflow/cli/HEAD/scripts/install.ps1 | iex
```

### Go Install

Alternatively, install directly via Go:

```bash
go install github.com/voiceflow/cli/cmd/vf@latest
```

### Manual Download

Download pre-built binaries for your platform from the [releases page](https://github.com/voiceflow/cli/releases).
<!-- No CLI Installation [installation] -->

## Quickstart: zero to a talking agent

Runnable end to end by a person or by a coding agent. You need an access token and [`jq`](https://jqlang.org) (used only to pull IDs out of the JSON responses). Create a **personal access token** in Voiceflow under **Settings → Access tokens** (tokens start with `vfp_`; they expire, default 30 days), then:

```bash
export VF_TOKEN=vfp_...   # every command also accepts --token

# 1. Pick a workspace (also proves the token works)
WORKSPACE_ID=$(vf workspace list --output-format json | jq -r '.workspaces[0].id')

# 2. Create an agent project
PROJECT_ID=$(vf project create --name "My Agent" --type webchat \
  --workspace-id "$WORKSPACE_ID" --output-format json | jq -r '.project.id')

# 3. Start a conversation (fresh projects have one environment, alias "main")
vf conversation send --user-id quickstart-user --project-id "$PROJECT_ID" \
  --environment-alias main --version-param draft \
  --action '{"type":"launch"}' --output-format json

# 4. Say something — same user-id continues the same conversation
vf conversation send --user-id quickstart-user --project-id "$PROJECT_ID" \
  --environment-alias main --version-param draft \
  --action '{"type":"text","payload":"What can you help me with?"}' --output-format json
```

The agent's replies arrive as `text` traces in the response. From here: edit the agent's instructions (`vf agent update`), add knowledge (`vf document create-url`), run tests (`vf test run create`), and publish (`vf environment publish`).

Worth knowing before you script against the CLI:

- **Use `--version-param draft`** — a fresh project has no published release yet.
- **Pass `--output-format json` explicitly when piping.** Inside AI coding agents (`CLAUDECODE`, `CURSOR_AGENT`, …) the default output is TOON, not JSON.
- **Capture values with `--output-format json | jq -r`** — the built-in `--jq` flag emits JSON, so strings keep their quotes.
- **`vf whoami` is offline** — it shows which credential source is configured but does not validate the token. `vf workspace list` is the real check.
- **Look things up in-band**: `vf docs search "publish an environment"` and `vf docs get <page>` bring the documentation to the terminal — no browser, no auth.

<!-- Start Shell Completion [completion] -->
## Shell Completion

Shell completions are available for Bash, Zsh, Fish, and PowerShell.

### Bash

```bash
# Add to ~/.bashrc:
source <(vf completion bash)

# Or install permanently:
vf completion bash > /etc/bash_completion.d/vf
```

### Zsh

```zsh
# Add to ~/.zshrc:
source <(vf completion zsh)

# Or install permanently:
vf completion zsh > "${fpath[1]}/_vf"
```

### Fish

```fish
vf completion fish | source

# Or install permanently:
vf completion fish > ~/.config/fish/completions/vf.fish
```

### PowerShell

```powershell
vf completion powershell | Out-String | Invoke-Expression
```
<!-- End Shell Completion [completion] -->

<!-- Start CLI Example Usage [usage] -->
## CLI Example Usage

### Example

```bash
vf workspace list --token 'Bearer test_token'

```
<!-- End CLI Example Usage [usage] -->

<!-- Start Authentication [security] -->
## Authentication

Authentication credentials can be configured in four ways (in order of priority):

### 1. Command-line flags

Pass credentials directly as flags to any command:

```bash
vf --token <value> <command> [arguments]
```

### 2. Environment variables

Set credentials via environment variables:

| Variable | Description |
|----------|-------------|
| `VF_TOKEN` | Voiceflow bearer token |

### 3. OS Keychain (recommended for workstations)

Credentials are stored securely in your operating system's keychain when you run:

```bash
vf configure
```

Secret credentials (tokens, API keys, passwords) are automatically stored in:
- **macOS**: Keychain
- **Linux**: GNOME Keyring / KWallet (via D-Bus Secret Service)
- **Windows**: Windows Credential Locker

If no keychain is available (e.g., in CI environments), credentials fall back to the config file.

### 4. Configuration file

Run the interactive `configure` command to store non-secret settings:

```bash
vf configure
```

Configuration is stored in `~/.config/vf/config.yaml`.
<!-- End Authentication [security] -->

<!-- Start Available Commands [operations] -->
## Available Commands

<details open>
<summary>Available commands</summary>

### [workspace](docs/vf_workspace.md)

* [`list`](docs/vf_workspace_list.md) - List workspaces
* [`create`](docs/vf_workspace_create.md) - Create workspace
* [`get`](docs/vf_workspace_get.md) - Get workspace
* [`update`](docs/vf_workspace_update.md) - Update workspace
* [`delete`](docs/vf_workspace_delete.md) - Delete workspace

### [project](docs/vf_project.md)

* [`list`](docs/vf_project_list.md) - List projects
* [`create`](docs/vf_project_create.md) - Create project
* [`get`](docs/vf_project_get.md) - Get project
* [`update`](docs/vf_project_update.md) - Update project
* [`delete`](docs/vf_project_delete.md) - Delete project

### [environment](docs/vf_environment.md)

* [`list`](docs/vf_environment_list.md) - List environments
* [`merge`](docs/vf_environment_merge.md) - Merge environments
* [`update-traffic-split`](docs/vf_environment_update-traffic-split.md) - Update traffic split
* [`get`](docs/vf_environment_get.md) - Get environment
* [`update`](docs/vf_environment_update.md) - Update environment
* [`delete`](docs/vf_environment_delete.md) - Delete environment
* [`compile`](docs/vf_environment_compile.md) - Compile environment
* [`clone`](docs/vf_environment_clone.md) - Clone environment
* [`publish`](docs/vf_environment_publish.md) - Publish environment

### [variable](docs/vf_variable.md)

* [`list`](docs/vf_variable_list.md) - List variables
* [`create`](docs/vf_variable_create.md) - Create variable
* [`get`](docs/vf_variable_get.md) - Get variable
* [`update`](docs/vf_variable_update.md) - Update variable
* [`delete`](docs/vf_variable_delete.md) - Delete variable

### [playbook](docs/vf_playbook.md)

* [`list`](docs/vf_playbook_list.md) - List playbooks
* [`create`](docs/vf_playbook_create.md) - Create playbook
* [`get`](docs/vf_playbook_get.md) - Get playbook
* [`update`](docs/vf_playbook_update.md) - Update playbook
* [`delete`](docs/vf_playbook_delete.md) - Delete playbook

### [api-tool](docs/vf_api-tool.md)

* [`list`](docs/vf_api-tool_list.md) - List API tools
* [`create`](docs/vf_api-tool_create.md) - Create API tool
* [`get`](docs/vf_api-tool_get.md) - Get API tool
* [`update`](docs/vf_api-tool_update.md) - Update API tool
* [`delete`](docs/vf_api-tool_delete.md) - Delete API tool

#### [api-tool-variable](docs/vf_api-tool_api-tool-variable.md)

* [`list`](docs/vf_api-tool_api-tool-variable_list.md) - List variables
* [`create`](docs/vf_api-tool_api-tool-variable_create.md) - Create variable
* [`get`](docs/vf_api-tool_api-tool-variable_get.md) - Get variable
* [`update`](docs/vf_api-tool_api-tool-variable_update.md) - Update variable
* [`delete`](docs/vf_api-tool_api-tool-variable_delete.md) - Delete variable

### [transcript](docs/vf_transcript.md)

* [`search`](docs/vf_transcript_search.md) - Search transcripts
* [`get`](docs/vf_transcript_get.md) - Get transcript

#### [property](docs/vf_transcript_property.md)

* [`list`](docs/vf_transcript_property_list.md) - List properties
* [`create`](docs/vf_transcript_property_create.md) - Create property
* [`get`](docs/vf_transcript_property_get.md) - Get property
* [`update`](docs/vf_transcript_property_update.md) - Update property
* [`delete`](docs/vf_transcript_property_delete.md) - Delete property
* [`set-value`](docs/vf_transcript_property_set-value.md) - Set property value

### [function](docs/vf_function.md)

* [`list`](docs/vf_function_list.md) - List functions
* [`create`](docs/vf_function_create.md) - Create function
* [`get`](docs/vf_function_get.md) - Get function
* [`update`](docs/vf_function_update.md) - Update function
* [`delete`](docs/vf_function_delete.md) - Delete function

#### [function-variable](docs/vf_function_function-variable.md)

* [`list`](docs/vf_function_function-variable_list.md) - List variables
* [`create`](docs/vf_function_function-variable_create.md) - Create variable
* [`get`](docs/vf_function_function-variable_get.md) - Get variable
* [`update`](docs/vf_function_function-variable_update.md) - Update variable
* [`delete`](docs/vf_function_function-variable_delete.md) - Delete variable

#### [path](docs/vf_function_path.md)

* [`list`](docs/vf_function_path_list.md) - List paths
* [`create`](docs/vf_function_path_create.md) - Create path
* [`get`](docs/vf_function_path_get.md) - Get path
* [`update`](docs/vf_function_path_update.md) - Update path
* [`delete`](docs/vf_function_path_delete.md) - Delete path

### [evaluation](docs/vf_evaluation.md)

* [`list`](docs/vf_evaluation_list.md) - List evaluations
* [`create`](docs/vf_evaluation_create.md) - Create evaluation
* [`get`](docs/vf_evaluation_get.md) - Get evaluation
* [`update`](docs/vf_evaluation_update.md) - Update evaluation
* [`delete`](docs/vf_evaluation_delete.md) - Delete evaluation
* [`run`](docs/vf_evaluation_run.md) - Run evaluation

### [document](docs/vf_document.md)

* [`list`](docs/vf_document_list.md) - List documents
* [`create-url`](docs/vf_document_create-url.md) - Create URL document
* [`create-text`](docs/vf_document_create-text.md) - Create text document
* [`create-table`](docs/vf_document_create-table.md) - Create table document
* [`get`](docs/vf_document_get.md) - Get document
* [`update`](docs/vf_document_update.md) - Update document
* [`delete`](docs/vf_document_delete.md) - Delete document

### [agent](docs/vf_agent.md)

* [`get`](docs/vf_agent_get.md) - Get agent
* [`update`](docs/vf_agent_update.md) - Update agent

### [integration](docs/vf_integration.md)

* [`list`](docs/vf_integration_list.md) - List integrations
* [`connect`](docs/vf_integration_connect.md) - Connect integration
* [`disconnect`](docs/vf_integration_disconnect.md) - Disconnect integration

### [mcp-server](docs/vf_mcp-server.md)

* [`list`](docs/vf_mcp-server_list.md) - List MCP servers
* [`create`](docs/vf_mcp-server_create.md) - Create MCP server
* [`get`](docs/vf_mcp-server_get.md) - Get MCP server
* [`update`](docs/vf_mcp-server_update.md) - Update MCP server
* [`delete`](docs/vf_mcp-server_delete.md) - Delete MCP server
* [`sync`](docs/vf_mcp-server_sync.md) - Sync MCP server

### [mcp-tool](docs/vf_mcp-tool.md)

* [`list`](docs/vf_mcp-tool_list.md) - List MCP tools
* [`get`](docs/vf_mcp-tool_get.md) - Get MCP tool

### [secret](docs/vf_secret.md)

* [`list`](docs/vf_secret_list.md) - List secrets
* [`create`](docs/vf_secret_create.md) - Create secret
* [`list-overrides`](docs/vf_secret_list-overrides.md) - List secret overrides
* [`delete`](docs/vf_secret_delete.md) - Delete secret
* [`set-value`](docs/vf_secret_set-value.md) - Set secret value

### [tool](docs/vf_tool.md)

* [`list`](docs/vf_tool_list.md) - List tools
* [`create`](docs/vf_tool_create.md) - Create tool
* [`get`](docs/vf_tool_get.md) - Get tool
* [`update`](docs/vf_tool_update.md) - Update tool
* [`delete`](docs/vf_tool_delete.md) - Delete tool

### [knowledge-base](docs/vf_knowledge-base.md)

* [`query`](docs/vf_knowledge-base_query.md) - Query knowledge base

### [conversation](docs/vf_conversation.md)

* [`send`](docs/vf_conversation_send.md) - Send

#### [state](docs/vf_conversation_state.md)

* [`get`](docs/vf_conversation_state_get.md) - Get state
* [`update`](docs/vf_conversation_state_update.md) - Update state
* [`delete`](docs/vf_conversation_state_delete.md) - Delete state
* [`update-variables`](docs/vf_conversation_state_update-variables.md) - Update variables

### [analytics](docs/vf_analytics.md)

### [query](docs/vf_analytics_query.md)

* [`call-count`](docs/vf_analytics_query_call-count.md) - Query call count
* [`call-duration`](docs/vf_analytics_query_call-duration.md) - Query call duration
* [`workspace-transcript-count`](docs/vf_analytics_query_workspace-transcript-count.md) - Query workspace transcript count
* [`project-transcript-count`](docs/vf_analytics_query_project-transcript-count.md) - Query project transcript count
* [`project-transcript-cost`](docs/vf_analytics_query_project-transcript-cost.md) - Query transcript cost
* [`workspace-interaction-count`](docs/vf_analytics_query_workspace-interaction-count.md) - Query workspace interaction count
* [`project-interaction-count`](docs/vf_analytics_query_project-interaction-count.md) - Query project interaction count
* [`organization-token-usage`](docs/vf_analytics_query_organization-token-usage.md) - Query organization token usage
* [`workspace-token-usage`](docs/vf_analytics_query_workspace-token-usage.md) - Query workspace token usage
* [`project-token-usage`](docs/vf_analytics_query_project-token-usage.md) - Query project token usage
* [`hourly-organization-token-usage`](docs/vf_analytics_query_hourly-organization-token-usage.md) - Query hourly organization token usage
* [`hourly-project-token-usage`](docs/vf_analytics_query_hourly-project-token-usage.md) - Query hourly project token usage
* [`daily-token-usage`](docs/vf_analytics_query_daily-token-usage.md) - Query daily token usage
* [`entity-token-usage`](docs/vf_analytics_query_entity-token-usage.md) - Query entity token usage
* [`category-token-usage`](docs/vf_analytics_query_category-token-usage.md) - Query category token usage
* [`playbook-usage`](docs/vf_analytics_query_playbook-usage.md) - Query playbook usage
* [`workflow-usage`](docs/vf_analytics_query_workflow-usage.md) - Query workflow usage
* [`prompt-usage`](docs/vf_analytics_query_prompt-usage.md) - Query prompt usage
* [`intent-usage`](docs/vf_analytics_query_intent-usage.md) - Query intent usage
* [`function-usage`](docs/vf_analytics_query_function-usage.md) - Query function usage
* [`api-tool-usage`](docs/vf_analytics_query_api-tool-usage.md) - Query API tool usage
* [`mcp-tool-usage`](docs/vf_analytics_query_mcp-tool-usage.md) - Query MCP tool usage
* [`knowledge-base-document-usage`](docs/vf_analytics_query_knowledge-base-document-usage.md) - Query knowledge base document usage
* [`integration-usage`](docs/vf_analytics_query_integration-usage.md) - Query integration usage
* [`unique-user-count`](docs/vf_analytics_query_unique-user-count.md) - Query unique user count

### [test](docs/vf_test.md)

* [`list`](docs/vf_test_list.md) - List tests
* [`create`](docs/vf_test_create.md) - Create test
* [`get`](docs/vf_test_get.md) - Get test
* [`update`](docs/vf_test_update.md) - Update test
* [`delete`](docs/vf_test_delete.md) - Delete test

#### [turn](docs/vf_test_turn.md)

* [`list`](docs/vf_test_turn_list.md) - List turns
* [`create`](docs/vf_test_turn_create.md) - Create turn
* [`get`](docs/vf_test_turn_get.md) - Get turn
* [`update`](docs/vf_test_turn_update.md) - Update turn
* [`delete`](docs/vf_test_turn_delete.md) - Delete turn

#### [check](docs/vf_test_check.md)

* [`list`](docs/vf_test_check_list.md) - List checks
* [`create`](docs/vf_test_check_create.md) - Create check
* [`get`](docs/vf_test_check_get.md) - Get check
* [`update`](docs/vf_test_check_update.md) - Update check
* [`delete`](docs/vf_test_check_delete.md) - Delete check

#### [run](docs/vf_test_run.md)

* [`search`](docs/vf_test_run_search.md) - Search runs
* [`create`](docs/vf_test_run_create.md) - Create run
* [`get`](docs/vf_test_run_get.md) - Get run

</details>
<!-- End Available Commands [operations] -->

<!-- Start Request Body Input [stdinpiping] -->
## Request Body Input

Operations that accept a request body support three input methods, with a clear priority chain:

### Individual flags (highest priority)

```bash
vf <command> --name "Jane" --age 30
```

### `--body` flag

Provide the entire request body as a JSON string:

```bash
vf <command> --body '{"name": "John", "age": 30}'
```

Individual flags override `--body` values:

```bash
# Result: {name: "Jane", age: 30}
vf <command> --body '{"name": "John", "age": 30}' --name "Jane"
```

### Stdin piping (lowest priority)

Pipe JSON into any command that accepts a request body:

```bash
echo '{"name": "John", "age": 30}' | vf <command>
```

Individual flags override stdin values:

```bash
# Result: {name: "Jane", age: 30}
echo '{"name": "John", "age": 30}' | vf <command> --name "Jane"
```

This is useful for chaining commands, reading from files, or scripting:

```bash
# Read body from a file
vf <command> < request.json

# Pipe from another command
curl -s https://example.com/data.json | vf <command>
```

### Priority

When multiple input methods are used, the priority is:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | Individual flags | `--name "Jane"` always wins |
| 2 | `--body` flag | Whole-body JSON via flag |
| 3 (lowest) | Stdin | Piped JSON input |
<!-- End Request Body Input [stdinpiping] -->

<!-- Start Server Selection [server] -->
## Server Selection

### Override Server URL

Use `--server-url` to override the server URL entirely, bypassing any named or indexed server selection:

```bash
vf --server-url https://custom-api.example.com <command> [arguments]
```

**Precedence**: `--server-url` > `--server` > default
<!-- End Server Selection [server] -->

<!-- Start Output Formats [output-formats] -->
## Output Formats

Every command supports a `--output-format` flag that controls how the response is rendered to stdout.

### Available formats

| Format | Flag | Description |
|--------|------|-------------|
| Pretty | `--output-format pretty` (default) | Aligned key-value pairs with color, nested indentation. Human-readable at a glance. |
| JSON | `--output-format json` | JSON output. Passthrough when the response is already JSON (preserves original field order and numeric precision). Falls back to typed marshaling otherwise. |
| YAML | `--output-format yaml` | YAML output via standard marshaling. |
| Table | `--output-format table` | Tabular output for array responses. |
| TOON | `--output-format toon` | [Token-Oriented Object Notation](https://github.com/toon-format/spec) — a compact, line-oriented format that typically uses 30–60% fewer tokens than JSON. Well-suited for piping responses into LLM prompts. |

```bash
# Default pretty output
vf <command>

# Machine-readable JSON
vf <command> --output-format json

# TOON for LLM-friendly compact output
vf <command> --output-format toon

# Pipe JSON to jq without using --output-format
vf <command> --output-format json | jq '.fieldName'
```

### jq filtering

Use `--jq` to filter or transform the response inline using a [jq](https://jqlang.org) expression. This always outputs JSON and overrides `--output-format`:

```bash
# Extract a single field
vf <command> --jq '.name'

# Filter an array
vf <command> --jq '.items[] | select(.active == true)'
```

### Color control

Use `--color` to control terminal colors:

| Value | Behavior |
|-------|----------|
| `auto` (default) | Color when stdout is a TTY, plain text otherwise |
| `always` | Always colorize |
| `never` | Never colorize |

The `NO_COLOR` and `FORCE_COLOR` environment variables are also respected.

### Streaming and pagination

When using `--all` (pagination) or streaming operations, output is written incrementally as items arrive:

| Format | Streaming behavior |
|--------|-------------------|
| `json` | One compact JSON object per line ([NDJSON](https://github.com/ndjson/ndjson-spec)) |
| `yaml` | YAML documents separated by `---` |
| `toon` | One TOON-encoded object per block, separated by blank lines |
| `pretty` (default) | Pretty-printed items separated by blank lines |
<!-- End Output Formats [output-formats] -->

<!-- Start Error Handling [errors] -->
## Error Handling

The CLI uses standard exit codes to indicate success or failure:

| Exit Code | Meaning |
|-----------|---------|
| `0` | Success |
| `1` | Error (API error, invalid input, etc.) |

On success, the response data is printed to **stdout** as JSON. On failure, error details are printed to **stderr**.

```bash
# Capture output and handle errors
vf ... > output.json 2> error.log
if [ $? -ne 0 ]; then
  echo "Error occurred, see error.log"
fi
```
<!-- End Error Handling [errors] -->

<!-- Start Diagnostics [diagnostics] -->
## Diagnostics

The CLI includes two diagnostic flags available on all commands:

### Dry Run

Preview what would be sent without making any network calls:

```bash
vf <command> --dry-run
```

Output goes to stderr and includes:
- HTTP method and URL
- Request headers (sensitive values redacted)
- Request body preview (sensitive fields redacted)

The command exits successfully without contacting the API. This is useful for verifying request construction before executing.

### Debug

Log request and response diagnostics while running normally:

```bash
vf <command> --debug
```

Debug output goes to stderr and includes:
- Request method, URL, headers, and body preview
- Response status, headers, and body preview
- Transport errors (if any)

The command still executes normally and produces its regular output on stdout.

### Flag Precedence

If both `--dry-run` and `--debug` are set, `--dry-run` takes precedence and no network calls are made.

### Security

Sensitive information is automatically redacted in diagnostic output:
- **Headers**: `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, and other security headers show `[REDACTED]`
- **Body**: JSON fields named `password`, `secret`, `token`, `api_key`, `client_secret`, etc. show `[REDACTED]`

Diagnostic output should still be treated as potentially sensitive operational data.
<!-- End Diagnostics [diagnostics] -->

<!-- Placeholder for Future Speakeasy SDK Sections -->

# Development

## Maturity

This CLI is in beta, and there may be breaking changes between versions without a major version update. Therefore, we recommend pinning usage
to a specific package version. This way, you can install the same version each time without breaking changes unless you are intentionally
looking for the latest version.

## Contributions

While we value open-source contributions to this CLI, this library is generated programmatically. Any manual changes added to internal files will be overwritten on the next generation. 
We look forward to hearing your feedback. Feel free to open a PR or an issue with a proof of concept and we'll do our best to include it in a future release. 

### CLI Created by [Speakeasy](https://www.speakeasy.com/?utm_source=github-com/voiceflow/cli&utm_campaign=cli)
