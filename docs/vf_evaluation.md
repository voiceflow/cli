## vf evaluation

Operations for evaluation

### Synopsis

Operations for evaluation

```
vf evaluation [flags]
```

### Options

```
  -h, --help   help for evaluation
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
* [vf evaluation create](vf_evaluation_create.md)	 - Create evaluation
* [vf evaluation delete](vf_evaluation_delete.md)	 - Delete evaluation
* [vf evaluation get](vf_evaluation_get.md)	 - Get evaluation
* [vf evaluation list](vf_evaluation_list.md)	 - List evaluations
* [vf evaluation run](vf_evaluation_run.md)	 - Run evaluation
* [vf evaluation update](vf_evaluation_update.md)	 - Update evaluation
