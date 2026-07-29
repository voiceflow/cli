## vf api-tool variable

Operations for api-tool-variable

### Synopsis

Operations for api-tool-variable

```
vf api-tool variable [flags]
```

### Options

```
  -h, --help   help for variable
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

* [vf api-tool](vf_api-tool.md)	 - Operations for api-tool
* [vf api-tool variable create](vf_api-tool_variable_create.md)	 - Create variable
* [vf api-tool variable delete](vf_api-tool_variable_delete.md)	 - Delete variable
* [vf api-tool variable get](vf_api-tool_variable_get.md)	 - Get variable
* [vf api-tool variable list](vf_api-tool_variable_list.md)	 - List variables
* [vf api-tool variable update](vf_api-tool_variable_update.md)	 - Update variable
