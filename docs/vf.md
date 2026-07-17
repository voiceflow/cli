## vf

Realtime: Realtime gateway API service

### Synopsis

Realtime: Realtime gateway API service

```
vf [flags]
```

### Options

```
      --agent-mode             Enable structured errors and default TOON output for AI coding agents. Automatically enabled when a known agent environment is detected (CLAUDE_CODE, CURSOR_AGENT, etc.). Use --agent-mode=false to disable.
      --color string           Control colored output: auto (color when output is a TTY), always, or never. Respects NO_COLOR and FORCE_COLOR env vars. (default "auto")
  -d, --debug                  Log request and response diagnostics to stderr
      --dry-run                Preview the request that would be sent without executing it (output to stderr)
  -H, --header stringArray     Set a custom HTTP request header (format: "Key: Value"). Can be specified multiple times.
  -h, --help                   help for vf
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

* [vf agent](vf_agent.md)	 - Operations for agent
* [vf analytics](vf_analytics.md)	 - Operations for analytics
* [vf api-tool](vf_api-tool.md)	 - Operations for api-tool
* [vf api-tool-variable](vf_api-tool-variable.md)	 - Operations for api-tool-variable
* [vf auth](vf_auth.md)	 - Manage authentication credentials
* [vf configure](vf_configure.md)	 - Configure authentication credentials and preferences
* [vf conversation](vf_conversation.md)	 - Operations for conversation
* [vf conversation-state](vf_conversation-state.md)	 - Operations for conversation-state
* [vf document](vf_document.md)	 - Operations for document
* [vf environment](vf_environment.md)	 - Operations for environment
* [vf evaluation](vf_evaluation.md)	 - Operations for evaluation
* [vf explore](vf_explore.md)	 - Interactively browse and run commands
* [vf function](vf_function.md)	 - Operations for function
* [vf function-path](vf_function-path.md)	 - Operations for function-path
* [vf function-variable](vf_function-variable.md)	 - Operations for function-variable
* [vf knowledge-base](vf_knowledge-base.md)	 - Operations for knowledge-base
* [vf mcp-server](vf_mcp-server.md)	 - Operations for mcp-server
* [vf mcp-tool](vf_mcp-tool.md)	 - Operations for mcp-tool
* [vf playbook](vf_playbook.md)	 - Operations for playbook
* [vf project](vf_project.md)	 - Operations for project
* [vf tool](vf_tool.md)	 - Operations for tool
* [vf transcript](vf_transcript.md)	 - Operations for transcript
* [vf transcript-property](vf_transcript-property.md)	 - Operations for transcript-property
* [vf variable](vf_variable.md)	 - Operations for variable
* [vf version](vf_version.md)	 - Print the CLI version
* [vf whoami](vf_whoami.md)	 - Display current authentication configuration
* [vf workspace](vf_workspace.md)	 - Operations for workspace
