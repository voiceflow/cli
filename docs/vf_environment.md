## vf environment

Operations for environment

### Synopsis

Operations for environment

```
vf environment [flags]
```

### Options

```
  -h, --help   help for environment
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

* [vf](vf.md)	 - Realtime: Realtime gateway API service
* [vf environment clone](vf_environment_clone.md)	 - Clone environment
* [vf environment compile](vf_environment_compile.md)	 - Compile environment
* [vf environment delete](vf_environment_delete.md)	 - Delete environment
* [vf environment get](vf_environment_get.md)	 - Get environment
* [vf environment list](vf_environment_list.md)	 - List environments
* [vf environment merge](vf_environment_merge.md)	 - Merge environments
* [vf environment publish](vf_environment_publish.md)	 - Publish environment
* [vf environment update](vf_environment_update.md)	 - Update environment
* [vf environment update-traffic-split](vf_environment_update-traffic-split.md)	 - Update traffic split
