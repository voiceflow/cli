## vf auth whoami

Display current authentication configuration

### Synopsis

Display the currently configured settings and their sources.

Sources are shown as:
  [flag]    - Set via command line flag
  [env]     - Set via environment variable (VF_*)
  [keyring] - Set via OS keychain (stored by login/configure command)
  [config]  - Set via config file (~/.config/vf/config.yaml)
  [unset]   - Not configured

Credential values are masked for security.

```
vf auth whoami [flags]
```

### Options

```
  -h, --help   help for whoami
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
