## vf document create-table

Create table document

### Synopsis

Create a new document from structured data.

```
vf document create-table [flags]
```

### Examples

```
  vf document create-table --project-id <id> --environment-alias <value> --name <value> --items '[{"key":"<value>"},{},{}]'
```

### Options

```
      --body string                        Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -e, --environment-alias string           [required]
  -h, --help                               help for create-table
  -i, --items string                       The table rows to ingest; each row is a flat object and becomes its own chunk. [required]
      --llm-based-chunks string            JSON value (one of: boolean | StableDocumentController_createTable_llmBasedChunks_enum)
      --llm-content-summarization string   JSON value (one of: boolean | StableDocumentController_createTable_llmContentSummarization_enum)
      --llm-generated-q string             JSON value (one of: boolean | StableDocumentController_createTable_llmGeneratedQ_enum)
      --llm-prepend-context string         JSON value (one of: boolean | StableDocumentController_createTable_llmPrependContext_enum)
      --markdown-conversion string         JSON value (one of: boolean | StableDocumentController_createTable_markdownConversion_enum)
      --max-chunk-size string              JSON value (one of: string | number)
      --metadata string                    Properties that can be filtered on at runtime (static or dynamic from a variable). Put your most common filter dimensions here.
  -n, --name string                        [required]
      --overwrite string                   JSON value (one of: boolean | StableDocumentController_createTable_overwrite_enum)
  -p, --project-id string                  [required]
  -s, --schema string                      Declares which top-level keys of each row are full-text searchable versus row-level metadata.
  -u, --url string                         An optional source URL to associate with the table document.
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

* [vf document](vf_document.md)	 - Operations for document
