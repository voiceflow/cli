## vf evaluation update

Update evaluation

### Synopsis

Update an evaluation by ID.

```
vf evaluation update [flags]
```

### Examples

```
  vf evaluation update --evaluation-id <id> --project-id <id>
```

### Options

```
      --body string                 Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -b, --body-param string           JSON value (variants: boolean: { truePrompt: string, falsePrompt: string, name: string, prompt: string, ... }, number: { minimumValue: number, maximumValue: number, minimumPrompt: string, maximumPrompt: string, ... }, string: { name: string, prompt: string, enabled: boolean, settings: object, ... }, option: { options: object[], name: string, prompt: string, enabled: boolean, ... })
      --body-param.boolean string   StableEvaluationUpdateRequest_Boolean variant as JSON
      --body-param.number string    StableEvaluationUpdateRequest_Number variant as JSON
      --body-param.option string    StableEvaluationUpdateRequest_Option_2 variant as JSON
      --body-param.string string    StableEvaluationUpdateRequest_String variant as JSON
  -e, --evaluation-id string        [required]
  -h, --help                        help for update
  -p, --project-id string           [required]
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

* [vf evaluation](vf_evaluation.md)	 - Operations for evaluation
