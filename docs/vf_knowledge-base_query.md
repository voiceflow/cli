## vf knowledge-base query

Query knowledge base

### Synopsis

Execute a query against documents in the knowledge base.

```
vf knowledge-base query [flags]
```

### Examples

```
  vf knowledge-base query --project-id <id> --environment-alias <value> --version-param published --question <value>
```

### Options

```
      --body string                Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -c, --chunk-limit int            The maximum number of document chunks to retrieve.
  -e, --environment-alias string   [required]
  -f, --filters string             Metadata filters used to narrow down which document chunks are searched.
  -h, --help                       help for query
  -i, --instruction string         An additional instruction applied when synthesizing the answer from the retrieved chunks.
  -p, --project-id string          [required]
      --question string            The natural-language question to ask the knowledge base. [required]
      --settings string            JSON object
      --synthesis                  Whether to synthesize an answer from the retrieved chunks; when false, only raw chunks are returned.
  -v, --version-param string       Whether to query the draft or the published version of the knowledge base. (options: draft, published) [required]
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

* [vf knowledge-base](vf_knowledge-base.md)	 - Operations for knowledge-base
