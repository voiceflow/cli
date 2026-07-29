## vf evaluation create

Create evaluation

### Synopsis

Create a new evaluation.

```
vf evaluation create [flags]
```

### Examples

```
  vf evaluation create --project-id <id>
```

### Options

```
      --body string                                     Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -b, --body-param string                               JSON value (variants: boolean: { type: string, truePrompt: string, falsePrompt: string, name: string, ... }, number: { type: string, minimumValue: number, maximumValue: number, minimumPrompt: string, ... }, string: { type: string, name: string, prompt: string, enabled: boolean, ... }, option: { type: string, options: object[], name: string, prompt: string, ... })
      --body-param.boolean string                       StableEvaluationCreateRequest_Boolean variant as JSON
      --body-param.boolean.description string           A human-readable description of what this evaluation measures.
      --body-param.boolean.enabled                      Whether this evaluation runs automatically against new transcripts. [required]
      --body-param.boolean.false-prompt false           The criteria describing when the evaluator should return false. [required]
      --body-param.boolean.name string                  [required]
      --body-param.boolean.prompt string                The criteria the evaluator uses to judge a transcript. [required]
      --body-param.boolean.true-prompt true             The criteria describing when the evaluator should return true. [required]
      --body-param.number string                        StableEvaluationCreateRequest_Number variant as JSON
      --body-param.number.description string            A human-readable description of what this evaluation measures.
      --body-param.number.enabled                       Whether this evaluation runs automatically against new transcripts. [required]
      --body-param.number.maximum-prompt maximumValue   The criteria describing what warrants the maximumValue score. [required]
      --body-param.number.maximum-value float           The highest score the evaluator can assign. [required]
      --body-param.number.minimum-prompt minimumValue   The criteria describing what warrants the minimumValue score. [required]
      --body-param.number.minimum-value float           The lowest score the evaluator can assign. [required]
      --body-param.number.name string                   [required]
      --body-param.number.prompt string                 The criteria the evaluator uses to judge a transcript. [required]
      --body-param.option string                        StableEvaluationCreateRequest_Option_2 variant as JSON
      --body-param.string string                        StableEvaluationCreateRequest_String variant as JSON
      --body-param.string.description string            A human-readable description of what this evaluation measures.
      --body-param.string.enabled                       Whether this evaluation runs automatically against new transcripts. [required]
      --body-param.string.name string                   [required]
      --body-param.string.prompt string                 The criteria the evaluator uses to judge a transcript. [required]
  -h, --help                                            help for create
  -p, --project-id string                               [required]
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
