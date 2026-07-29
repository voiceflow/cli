## vf function path update

Update path

### Synopsis

Update a path by ID.

```
vf function path update [flags]
```

### Examples

```
  vf path update --path-id <id> --project-id <id> --environment-alias <value>
```

### Options

```
      --body string                Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -e, --environment-alias string   [required]
  -h, --help                       help for update
  -l, --label name                 The display label shown for this path in the Voiceflow UI; falls back to name when null.
  -n, --name string                The name of the exit path, referenced by the function code when returning which path to take.
      --path-id string             [required]
      --project-id string          [required]
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

* [vf function path](vf_function_path.md)	 - Operations for path
