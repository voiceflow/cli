## vf auth signup

Create a Voiceflow account in the browser and sign in

### Synopsis

Create a Voiceflow account and sign in to it.

This opens your browser on the Voiceflow signup screen. You create the account
there — the CLI never asks for or handles a password — and once you finish, the
session is stored exactly as 'vf auth login' stores it. 'vf auth login --signup'
does the same.

Use --email to prefill the signup form. Signup includes verifying your email
address, so the CLI waits up to 15 minutes by default (--login-timeout).

In agent mode no browser is opened. The signup URL is printed as a JSON event
with status "awaiting_signup", for the agent to hand to the user, who creates
the account in their own browser. The command keeps waiting until they finish,
so run it in the background and read its output.

```
vf auth signup [flags]
```

### Examples

```
  vf auth signup
  vf auth signup --email you@example.com
```

### Options

```
      --email string             Email address to prefill on the signup form
  -h, --help                     help for signup
      --login-timeout duration   How long to wait for the browser to complete signup (default 15m0s)
      --no-browser               Print the signup URL instead of opening a browser (always on in agent mode)
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
