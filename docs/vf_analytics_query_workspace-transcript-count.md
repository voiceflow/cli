## vf analytics query workspace-transcript-count

Query workspace transcript count

### Synopsis

Query transcript count for a workspace.

```
vf analytics query workspace-transcript-count [flags]
```

### Examples

```
  vf query workspace-transcript-count --workspace-id <id> --end-date <value> --start-date <value>
```

### Options

```
      --body string               Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -e, --end-date string           [required]
  -h, --help                      help for workspace-transcript-count
  -p, --project-ids stringArray   The IDs of the projects to filter results by. Defaults to all projects in the workspace.
  -s, --start-date string         [required]
  -t, --timezone string           string value
  -w, --workspace-id string       [required]
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
      --server string          Select a server by index (for indexed servers) or name (for named servers)
      --server-url string      Override the default server URL
      --timeout string         HTTP request timeout (e.g., 30s, 5m, 100ms)
      --token string           Voiceflow bearer token
      --usage                  Print the CLI Usage schema in KDL format
```

### SEE ALSO

* [vf analytics query](vf_analytics_query.md)	 - Operations for query
