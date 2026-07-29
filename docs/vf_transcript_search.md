## vf transcript search

Search transcripts

### Synopsis

Search transcripts by project ID.

```
vf transcript search [flags]
```

### Examples

```
  vf transcript search --project-id <id>
```

### Options

```
      --body string                Request body as JSON (alternative to individual flags). Can also be provided via stdin.
      --end-date string            When provided, only transcripts created at or before this ISO 8601 timestamp are returned.
      --environment-alias string   When provided, only transcripts from the environment with this alias are returned.
  -f, --filters string             list of values
  -h, --help                       help for search
  -p, --project-id string          [required]
      --session-id string          When provided, only transcripts from this conversation session are returned.
      --skip int                   The number of results to skip, used for pagination.
      --start-date string          When provided, only transcripts created at or after this ISO 8601 timestamp are returned.
  -t, --take float                 The maximum number of results to return, used for pagination. (default 20)
  -v, --version-param string       When provided, only transcripts from draft or published conversations are returned. (options: draft, published)
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

* [vf transcript](vf_transcript.md)	 - Operations for transcript
