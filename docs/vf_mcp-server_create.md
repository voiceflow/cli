## vf mcp-server create

Create MCP server

### Synopsis

Create a new MCP server.

```
vf mcp-server create [flags]
```

### Examples

```
  vf mcp-server create --project-id <id> --environment-alias <value> --name <value> --url '[]'
```

### Options

```
      --body string                Request body as JSON (alternative to individual flags). Can also be provided via stdin.
      --description string         A human-readable description of what the MCP server provides. (default "null")
  -e, --environment-alias string   [required]
      --headers string             list of values
  -h, --help                       help for create
  -n, --name string                [required]
  -p, --project-id string          [required]
  -s, --specification string       options: 2025-03-26, 2025-06-18 (default "2025-06-18")
  -u, --url string                 [required]
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

* [vf mcp-server](vf_mcp-server.md)	 - Operations for mcp-server
