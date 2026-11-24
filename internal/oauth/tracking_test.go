package oauth

import "testing"

func TestAuthorizationURLCarriesSignupTracking(t *testing.T) {
	md := Metadata{AuthorizationEndpoint: "https://auth.test/authorize"}
	query := mustParseQuery(t, authorizationURL(md, "client-1", "http://127.0.0.1:51330/oauth/callback", "s", "c", nil, DefaultResource, PromptCreate, "", "claude_code"))

	want := map[string]string{
		"utm_source":   "voiceflow_cli",
		"utm_medium":   "product",
		"utm_campaign": "cli_signup",
		"utm_content":  "signup",
		"cli_agent":    "claude_code",
	}
	for key, value := range want {
		if got := query.Get(key); got != value {
			t.Errorf("%s = %q, want %q", key, got, value)
		}
	}
}

func TestAuthorizationURLMarksALoginAsLogin(t *testing.T) {
	md := Metadata{AuthorizationEndpoint: "https://auth.test/authorize"}
	query := mustParseQuery(t, authorizationURL(md, "client-1", "http://127.0.0.1:51330/oauth/callback", "s", "c", nil, DefaultResource, "", "", CLIAgentNone))

	if got := query.Get("utm_content"); got != "login" {
		t.Errorf("utm_content = %q, want login", got)
	}
	if got := query.Get("utm_campaign"); got != "cli_signup" {
		t.Errorf("utm_campaign = %q, want the same campaign as signup", got)
	}
	if got := query.Get("cli_agent"); got != "none" {
		t.Errorf("cli_agent = %q, want none", got)
	}
}

func TestDetectCLIAgent(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{name: "no agent", env: nil, want: "none"},
		{name: "Claude Code", env: map[string]string{"CLAUDECODE": "1"}, want: "claude_code"},
		{name: "Codex sandbox", env: map[string]string{"CODEX_SANDBOX": "seatbelt"}, want: "codex"},
		{name: "Codex shell tool", env: map[string]string{"CODEX_THREAD_ID": "0199a1b2-c3d4"}, want: "codex"},
		{name: "Cursor", env: map[string]string{"CURSOR_AGENT": "true"}, want: "cursor"},
		{name: "a falsy flag is not an agent", env: map[string]string{"CLAUDECODE": "0"}, want: "none"},
		{name: "forced agent mode names no agent", env: map[string]string{"FORCE_AGENT_MODE": "1"}, want: "none"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := detectCLIAgent(envFunc(tt.env)); got != tt.want {
				t.Errorf("detectCLIAgent = %q, want %q", got, tt.want)
			}
		})
	}
}
