## vf agent update

Update agent

### Synopsis

Update agent configuration.

```
vf agent update [flags]
```

### Examples

```
  vf agent update --project-id <id> --environment-alias <value>
```

### Options

```
      --body string                   Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -b, --button-tool string            JSON object
      --call-forward-tool string      JSON object
      --card-tool string              JSON object
      --carousel-tool string          JSON object
      --end-tool string               JSON object
      --environment-alias string      [required]
  -h, --help                          help for update
      --include-guidelines            Whether to append the default prompting guidelines to the global prompt.
      --instructions string           list of values
  -k, --knowledge-base-tool string    JSON object
  -l, --llm string                    JSON object
      --path-tool-order stringArray   The ordered list of path tool IDs that controls the order of the agent exit paths.
      --playbooks string              Playbooks available for the agent to invoke.
      --project-id string             [required]
      --prompt string                 list of values
  -s, --skip-turn-tool string         JSON object
  -v, --voice string                  JSON object
      --web-search-tool string        JSON object
      --workflows string              Workflows available for the agent to invoke.
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

* [vf agent](vf_agent.md)	 - Operations for agent
