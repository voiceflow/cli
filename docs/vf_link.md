## vf link

Pin a project and environment to this directory

### Synopsis

Pin a Voiceflow project and environment to the current directory.

Every vf command run here, or in any directory below, then uses them by
default, so --project-id and --environment-alias can be left out. An explicit
flag always wins. Deleting a project, environment or workspace always needs
its flag: a link never fills in what a delete destroys.

The link is .voiceflow/project.json. It holds ids, the project name and the
environment alias — nothing secret. Remove it with 'vf unlink'.

The project id is in Creator under the agent's Settings → General (Metadata).
A Creator page URL will not do: the id in it is a version id.

```
vf link <project-id> [flags]
```

### Examples

```
  vf link 6a67842584dac97c7626ebaa
  vf link 6a67842584dac97c7626ebaa --environment-alias dev
```

### Options

```
  -e, --environment-alias string   Environment to link (default "main")
  -h, --help                       help for link
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

* [vf](vf.md)	 - Realtime: Realtime gateway API service
