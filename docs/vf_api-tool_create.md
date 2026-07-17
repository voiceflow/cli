## vf api-tool create

Create API tool

### Synopsis

Create a new API tool.

```
vf api-tool create [flags]
```

### Examples

```
  vf api-tool create --project-id <id> --environment-alias <value> --name <value> --http-method put
```

### Options

```
      --body string                     Request body as JSON (alternative to individual flags). Can also be provided via stdin.
  -b, --body-param string               JSON value (variants: raw-input: { type: string, contentType: string, content: value[] }, form-data: { type: string, formData: object[] }, url-encoded: { type: string, params: object[] })
      --body-param.form-data string     StableAPIToolCreateRequest_APIToolFormDataBody variant as JSON
      --body-param.raw-input string     StableAPIToolCreateRequest_APIToolRawBody variant as JSON
      --body-param.url-encoded string   StableAPIToolCreateRequest_APIToolURLEncodedBody variant as JSON
      --description string              A description of what the API tool does, used by the agent to decide when to call it.
  -e, --environment-alias string        [required]
      --headers string                  list of values
  -h, --help                            help for create
      --http-method string              options: get, put, post, patch, delete [required]
  -n, --name string                     [required]
  -p, --project-id string               [required]
      --query-parameters string         list of values
  -s, --settings string                 JSON object
  -u, --url string                      list of values
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

* [vf api-tool](vf_api-tool.md)	 - Operations for api-tool
