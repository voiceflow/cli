## vf tool update

Update tool

### Synopsis

Update a tool by ID.

```
vf tool update [flags]
```

### Examples

```
  vf tool update --tool-id <id> --project-id <id> --environment-alias <value>
```

### Options

```
      --body string                  Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -b, --body-param string            JSON value (variants: api: { description: string, captureInputVariables: object, type: string, asyncExecution: boolean, ... }, function: { description: string, captureInputVariables: object, type: string, asyncExecution: boolean, ... }, mcp: { description: string, captureInputVariables: object, type: string, inputVariables: object, ... })
      --body-param.api string        StableToolUpdateRequest_API variant as JSON
      --body-param.function string   StableToolUpdateRequest_Function variant as JSON
      --body-param.mcp string        StableToolUpdateRequest_Mcp variant as JSON
  -e, --environment-alias string     [required]
  -h, --help                         help for update
  -p, --project-id string            [required]
  -t, --tool-id string               [required]
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

* [vf tool](vf_tool.md)	 - Operations for tool
