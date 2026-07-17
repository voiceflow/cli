## vf mcp-server

Operations for mcp-server

### Synopsis

Operations for mcp-server

```
vf mcp-server [flags]
```

### Options

```
  -h, --help   help for mcp-server
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

* [vf](vf.md)	 - Realtime: Realtime gateway API service
* [vf mcp-server create](vf_mcp-server_create.md)	 - Create MCP server
* [vf mcp-server delete](vf_mcp-server_delete.md)	 - Delete MCP server
* [vf mcp-server get](vf_mcp-server_get.md)	 - Get MCP server
* [vf mcp-server list](vf_mcp-server_list.md)	 - List MCP servers
* [vf mcp-server sync](vf_mcp-server_sync.md)	 - Sync MCP server
* [vf mcp-server update](vf_mcp-server_update.md)	 - Update MCP server
