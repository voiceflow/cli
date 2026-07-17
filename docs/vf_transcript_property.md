## vf transcript property

Operations for property

### Synopsis

Operations for property

```
vf transcript property [flags]
```

### Options

```
  -h, --help   help for property
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

* [vf transcript](vf_transcript.md)	 - Operations for transcript
* [vf transcript property create](vf_transcript_property_create.md)	 - Create property
* [vf transcript property delete](vf_transcript_property_delete.md)	 - Delete property
* [vf transcript property get](vf_transcript_property_get.md)	 - Get property
* [vf transcript property list](vf_transcript_property_list.md)	 - List properties
* [vf transcript property set-value](vf_transcript_property_set-value.md)	 - Set property value
* [vf transcript property update](vf_transcript_property_update.md)	 - Update property
