## vf auth login

Sign in through the browser or configure credentials

### Synopsis

Sign in to Voiceflow.

By default this opens your browser to complete an OAuth2 authorization code
flow, then stores the resulting access and refresh tokens in the OS keychain
when available, with an owner-only file fallback.

Use --token to store a bearer token non-interactively, or --manual to be
prompted for one. Use the configure command for both authentication and global
parameters.

```
vf auth login [flags]
```

### Options

```
  -h, --help                     help for login
      --login-timeout duration   How long to wait for the browser to complete sign-in (default 5m0s)
      --manual                   Prompt for a bearer token instead of signing in through the browser
      --no-browser               Print the sign-in URL instead of opening a browser
      --scope stringArray        OAuth scope to request (repeatable). Defaults to the scopes the authorization server advertises.
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

* [vf auth](vf_auth.md)	 - Manage authentication credentials
