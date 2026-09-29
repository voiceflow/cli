## vf context

Summarize a project for an AI coding agent in one call

### Synopsis

Summarize a Voiceflow project in one call: what the agent is (model, global
prompt, instructions, playbooks, workflows, functions, tools, variables and
knowledge base), what changed most recently, the latest conversations, and
the rules for working on it.

It reads the linked project (see 'vf link'), or --project-id and
--environment-alias. The CLI makes the underlying API calls itself, in
parallel, and returns an outline rather than the raw data: long text is
clipped and long lists are capped, with the true totals under counts. In
agent mode the output is TOON and stays under 20 KB (about 5,000 tokens)
however large the project is. drillDown lists the commands that return
anything the outline leaves out.

If part of the project cannot be read, the outline still prints and warnings
names what is missing.

```
vf context [flags]
```

### Examples

```
  vf context
  vf context --project-id 6a67842584dac97c7626ebaa --environment-alias dev
  vf context --output-format json
```

### Options

```
  -e, --environment-alias string   Environment to summarize (default: the linked environment, else main)
  -h, --help                       help for context
  -p, --project-id string          Project to summarize (default: the linked project)
```

### Options inherited from parent commands

```
      --agent-mode             Enable structured errors and default TOON output for AI coding agents. Automatically enabled when a known agent environment is detected (CLAUDE_CODE, CURSOR_AGENT, etc.). Use --agent-mode=false to disable.
      --color string           Control colored output: auto (color when output is a TTY), always, or never. Respects NO_COLOR and FORCE_COLOR env vars. (default "auto")
  -d, --debug                  Log request and response diagnostics to stderr
      --dry-run                Preview the request that would be sent without executing it (output to stderr)
  -H, --header stringArray     Set a custom HTTP request header (format: "Key: Value"). Can be specified multiple times.
      --include-headers        Include HTTP response headers in the output
  -q, --jq string              Filter and transform output using a jq expression (e.g., '.name', '.items[] | .id')
      --no-interactive         Disable all interactive features (auto-prompting, explorer auto-launch, TUI forms)
  -o, --output-format string   Specify the output format. Options: pretty, json, yaml, table, toon. (default "pretty")
      --server-url string      Override the default server URL
      --timeout string         HTTP request timeout (e.g., 30s, 5m, 100ms)
      --token string           Voiceflow bearer token
      --usage                  Print the CLI Usage schema in KDL format
```

### SEE ALSO

* [vf](vf.md)	 - Realtime: Realtime gateway API service
