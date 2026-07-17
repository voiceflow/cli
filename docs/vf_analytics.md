## vf analytics

Operations for analytics

### Synopsis

Operations for analytics

```
vf analytics [flags]
```

### Options

```
  -h, --help   help for analytics
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
* [vf analytics query-api-tool-usage](vf_analytics_query-api-tool-usage.md)	 - Query API tool usage
* [vf analytics query-call-count](vf_analytics_query-call-count.md)	 - Query call count
* [vf analytics query-call-duration](vf_analytics_query-call-duration.md)	 - Query call duration
* [vf analytics query-category-token-usage](vf_analytics_query-category-token-usage.md)	 - Query category token usage
* [vf analytics query-daily-token-usage](vf_analytics_query-daily-token-usage.md)	 - Query daily token usage
* [vf analytics query-entity-token-usage](vf_analytics_query-entity-token-usage.md)	 - Query entity token usage
* [vf analytics query-function-usage](vf_analytics_query-function-usage.md)	 - Query function usage
* [vf analytics query-hourly-organization-token-usage](vf_analytics_query-hourly-organization-token-usage.md)	 - Query hourly organization token usage
* [vf analytics query-hourly-project-token-usage](vf_analytics_query-hourly-project-token-usage.md)	 - Query hourly project token usage
* [vf analytics query-integration-usage](vf_analytics_query-integration-usage.md)	 - Query integration usage
* [vf analytics query-intent-usage](vf_analytics_query-intent-usage.md)	 - Query intent usage
* [vf analytics query-knowledge-base-document-usage](vf_analytics_query-knowledge-base-document-usage.md)	 - Query knowledge base document usage
* [vf analytics query-mcp-tool-usage](vf_analytics_query-mcp-tool-usage.md)	 - Query MCP tool usage
* [vf analytics query-organization-token-usage](vf_analytics_query-organization-token-usage.md)	 - Query organization token usage
* [vf analytics query-playbook-usage](vf_analytics_query-playbook-usage.md)	 - Query playbook usage
* [vf analytics query-project-interaction-count](vf_analytics_query-project-interaction-count.md)	 - Query project interaction count
* [vf analytics query-project-token-usage](vf_analytics_query-project-token-usage.md)	 - Query project token usage
* [vf analytics query-project-transcript-cost](vf_analytics_query-project-transcript-cost.md)	 - Query transcript cost
* [vf analytics query-project-transcript-count](vf_analytics_query-project-transcript-count.md)	 - Query project transcript count
* [vf analytics query-prompt-usage](vf_analytics_query-prompt-usage.md)	 - Query prompt usage
* [vf analytics query-unique-user-count](vf_analytics_query-unique-user-count.md)	 - Query unique user count
* [vf analytics query-workflow-usage](vf_analytics_query-workflow-usage.md)	 - Query workflow usage
* [vf analytics query-workspace-interaction-count](vf_analytics_query-workspace-interaction-count.md)	 - Query workspace interaction count
* [vf analytics query-workspace-token-usage](vf_analytics_query-workspace-token-usage.md)	 - Query workspace token usage
* [vf analytics query-workspace-transcript-count](vf_analytics_query-workspace-transcript-count.md)	 - Query workspace transcript count
