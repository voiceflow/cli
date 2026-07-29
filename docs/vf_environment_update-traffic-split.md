## vf environment update-traffic-split

Update traffic split

### Synopsis

Update the percentage of traffic routed to each environment.

```
vf environment update-traffic-split [flags]
```

### Examples

```
  vf environment update-traffic-split --project-id <id> --traffic '{"key":1314.98,"key1":2310.29}'
```

### Options

```
      --body string         Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -h, --help                help for update-traffic-split
  -p, --project-id string   [required]
  -t, --traffic string      Map of environmentAlias → traffic percentage (0-100). Values must sum to 100. [required]
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

* [vf environment](vf_environment.md)	 - Operations for environment
