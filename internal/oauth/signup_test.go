package oauth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/spf13/cobra"
)

// newSignupTestCmd builds 'vf auth' with login and signup registered the way
// the generated auth command registers them.
func newSignupTestCmd(lister WorkspaceLister) *cobra.Command {
	root := newLoginTestCmd()
	auth := &cobra.Command{Use: "auth"}
	root.AddCommand(auth)
	AddSignupCommand(auth, lister)
	return root
}

// useWorkspaceLister swaps in a lister and short retry timings for the test.
func useWorkspaceLister(t *testing.T, lister WorkspaceLister) {
	t.Helper()
	origLister, origWait, origPoll := workspaceLister, workspaceWait, workspacePoll
	workspaceLister, workspaceWait, workspacePoll = lister, 2*time.Second, 10*time.Millisecond
	t.Cleanup(func() { workspaceLister, workspaceWait, workspacePoll = origLister, origWait, origPoll })
}

// executeCmd parses args against root and returns the command that ran, so
// tests can read its flags as RunLogin would.
func executeCmd(t *testing.T, root *cobra.Command, args ...string) *cobra.Command {
	t.Helper()
	root.SetArgs(args)
	root.SetOut(io.Discard)
	root.SetErr(io.Discard)
	// Parse the flags without running the real RunE, which would start a login.
	cmd, flags, err := root.Find(args)
	if err != nil {
		t.Fatalf("find %v: %v", args, err)
	}
	if err := cmd.ParseFlags(flags); err != nil {
		t.Fatalf("parse %v: %v", args, err)
	}
	return cmd
}

func TestAuthorizationURLCarriesPromptAndLoginHint(t *testing.T) {
	md := Metadata{AuthorizationEndpoint: "https://auth.test/authorize"}
	query := mustParseQuery(t, authorizationURL(md, "client-1", "http://127.0.0.1:51330/oauth/callback", "s", "c", nil, DefaultResource, PromptCreate, "you@example.com"))

	if got := query.Get("prompt"); got != "create" {
		t.Errorf("prompt = %q, want create", got)
	}
	if got := query.Get("login_hint"); got != "you@example.com" {
		t.Errorf("login_hint = %q, want the email", got)
	}
}

func TestAuthorizationURLOmitsPromptForLogin(t *testing.T) {
	md := Metadata{AuthorizationEndpoint: "https://auth.test/authorize"}
	// A login_hint without prompt=create is never sent: the strict authorize
	// DTO accepts the two together.
	query := mustParseQuery(t, authorizationURL(md, "client-1", "http://127.0.0.1:51330/oauth/callback", "s", "c", nil, DefaultResource, "", "you@example.com"))

	for _, key := range []string{"prompt", "login_hint"} {
		if query.Has(key) {
			t.Errorf("%s = %q, want it absent from a login URL", key, query.Get(key))
		}
	}
}

func TestSupportsPrompt(t *testing.T) {
	if (Metadata{}).supportsPrompt(PromptCreate) {
		t.Error("a server that lists no prompt values must not be treated as supporting create")
	}
	if !(Metadata{PromptValuesSupported: []string{"none", "create"}}).supportsPrompt(PromptCreate) {
		t.Error("create in the list should be detected")
	}
	// Discovery can fail; the fallback must then degrade signup to login.
	if fallbackMetadata.supportsPrompt(PromptCreate) {
		t.Error("fallbackMetadata must not claim prompt=create")
	}
}

func TestLoginSendsPromptCreateWhenTheServerSupportsIt(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)
	server.promptValues = []string{"create"}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	out := &strings.Builder{}
	if _, err := Login(ctx, testEnv(server), LoginOptions{Out: out, Timeout: 15 * time.Second, Prompt: PromptCreate, LoginHint: "you@example.com"}); err != nil {
		t.Fatalf("Login: %v\noutput:\n%s", err, out)
	}

	authorize := server.lastAuthorizeRequest(t)
	if authorize.Get("prompt") != "create" || authorize.Get("login_hint") != "you@example.com" {
		t.Errorf("authorization request = %v, want prompt=create and the login_hint", authorize)
	}
	if !strings.Contains(out.String(), "create your account") {
		t.Errorf("output = %q, want it to say the browser is for creating an account", out)
	}
	if strings.Contains(out.String(), "Warning") {
		t.Errorf("output = %q, want no warning when create is supported", out)
	}
}

func TestLoginFallsBackToLoginWhenTheServerDoesNotSupportCreate(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t) // advertises no prompt values

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	out := &strings.Builder{}
	session, err := Login(ctx, testEnv(server), LoginOptions{Out: out, Timeout: 15 * time.Second, Prompt: PromptCreate, LoginHint: "you@example.com"})
	if err != nil {
		t.Fatalf("Login: %v\noutput:\n%s", err, out)
	}
	if session.AccessToken == "" {
		t.Error("the fallback login stored no session")
	}

	authorize := server.lastAuthorizeRequest(t)
	for _, key := range []string{"prompt", "login_hint"} {
		if authorize.Has(key) {
			t.Errorf("%s = %q, want it dropped for a server without create", key, authorize.Get(key))
		}
	}
	if !strings.Contains(out.String(), "Warning: the authorization server") || !strings.Contains(out.String(), "ordinary sign-in") {
		t.Errorf("output = %q, want a warning that signup fell back to sign-in", out)
	}
}

func TestLoginOptionsFromFlags(t *testing.T) {
	cases := []struct {
		name        string
		args        []string
		signup      bool
		wantTimeout time.Duration
		wantPrompt  string
		wantHint    string
	}{
		{"login", []string{"login"}, false, DefaultLoginTimeout, "", ""},
		{"login --signup takes the signup timeout", []string{"login", "--signup", "--email", "a@b.co"}, true, DefaultSignupTimeout, PromptCreate, "a@b.co"},
		{"an explicit timeout wins", []string{"login", "--signup", "--login-timeout", "1m"}, true, time.Minute, PromptCreate, ""},
		{"signup command", []string{"auth", "signup", "--email", "a@b.co"}, true, DefaultSignupTimeout, PromptCreate, "a@b.co"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			useWorkspaceLister(t, nil)
			cmd := executeCmd(t, newSignupTestCmd(nil), tc.args...)
			opts := loginOptionsFromFlags(cmd, tc.signup)
			if opts.Timeout != tc.wantTimeout {
				t.Errorf("timeout = %s, want %s", opts.Timeout, tc.wantTimeout)
			}
			if opts.Prompt != tc.wantPrompt || opts.LoginHint != tc.wantHint {
				t.Errorf("prompt/login_hint = %q/%q, want %q/%q", opts.Prompt, opts.LoginHint, tc.wantPrompt, tc.wantHint)
			}
		})
	}
}

func TestSignupRejectsNonBrowserFlags(t *testing.T) {
	cases := [][]string{
		{"login", "--signup", "--manual"},
		{"login", "--signup", "--token", "abc"},
		{"login", "--signup", "--no-interactive"},
		{"auth", "signup", "--token", "abc"},
	}
	for _, args := range cases {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			useWorkspaceLister(t, nil)
			cmd := executeCmd(t, newSignupTestCmd(nil), args...)
			if args[0] == "login" && !ShouldUseBrowserLogin(cmd) {
				t.Fatal("--signup must take the browser path, which reports the conflict")
			}
			if err := checkSignupFlags(cmd); err == nil || !strings.Contains(err.Error(), "cannot be combined") {
				t.Errorf("checkSignupFlags(%v) = %v, want a conflict error", args, err)
			}
		})
	}
}

func TestEmailWithoutSignupStillReachesRunLogin(t *testing.T) {
	// Otherwise --token or --no-interactive would take the token-entry path
	// and quietly ignore --email.
	for _, args := range [][]string{
		{"login", "--email", "a@b.co", "--token", "abc"},
		{"login", "--email", "a@b.co", "--no-interactive"},
		{"login", "--email", "a@b.co", "--manual"},
	} {
		cmd := executeCmd(t, newSignupTestCmd(nil), args...)
		if !ShouldUseBrowserLogin(cmd) {
			t.Errorf("ShouldUseBrowserLogin(%v) = false, want --email routed to RunLogin", args)
		}
		if err := RunLogin(cmd); err == nil || !strings.Contains(err.Error(), "--email is only used with --signup") {
			t.Errorf("RunLogin(%v) = %v, want --email rejected without --signup", args, err)
		}
	}
}

func TestRunLoginRejectsEmailWithoutSignup(t *testing.T) {
	cmd := executeCmd(t, newSignupTestCmd(nil), "login", "--email", "a@b.co")
	if err := RunLogin(cmd); err == nil || !strings.Contains(err.Error(), "--email is only used with --signup") {
		t.Errorf("RunLogin = %v, want --email rejected without --signup", err)
	}
}

func TestAccountFromToken(t *testing.T) {
	jwt := func(claims string) string {
		return "eyJhbGciOiJSUzI1NiJ9." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".sig"
	}
	cases := map[string]string{
		jwt(`{"sub":"42","sessionID":"s"}`):           "user 42",
		jwt(`{"sub":"42","email":"you@example.com"}`): "you@example.com",
		jwt(`{"sessionID":"s"}`):                      "",
		"access-1":                                    "",
		"a.%%%.c":                                     "",
	}
	for token, want := range cases {
		if got := accountFromToken(token); got != want {
			t.Errorf("accountFromToken(%q) = %q, want %q", token, got, want)
		}
	}
}

func TestWaitForWorkspacesRetriesUntilTheFirstWorkspaceExists(t *testing.T) {
	var mu sync.Mutex
	calls := 0
	useWorkspaceLister(t, func(context.Context, *cobra.Command, string) ([]Workspace, error) {
		mu.Lock()
		defer mu.Unlock()
		calls++
		switch calls {
		case 1:
			return nil, errors.New("503 Service Unavailable")
		case 2:
			return nil, nil // created asynchronously, not there yet
		default:
			return []Workspace{{ID: "ws-1", Name: "My Workspace"}}, nil
		}
	})

	workspaces, err := waitForWorkspaces(context.Background(), &cobra.Command{}, "token")
	if err != nil {
		t.Fatalf("waitForWorkspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].ID != "ws-1" {
		t.Errorf("workspaces = %v, want the workspace from the third attempt", workspaces)
	}
	if calls != 3 {
		t.Errorf("calls = %d, want 3", calls)
	}
}

func TestWaitForWorkspacesGivesUp(t *testing.T) {
	useWorkspaceLister(t, func(context.Context, *cobra.Command, string) ([]Workspace, error) {
		return nil, errors.New("boom")
	})
	workspaceWait = 50 * time.Millisecond

	if _, err := waitForWorkspaces(context.Background(), &cobra.Command{}, "token"); err == nil || err.Error() != "boom" {
		t.Errorf("waitForWorkspaces = %v, want the last error once it gives up", err)
	}
}

func TestRunSignupPrintsTheAccountWorkspacesAndNextSteps(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)
	server.promptValues = []string{"create"}

	t.Setenv(envIssuer, server.URL)
	t.Setenv(envResource, "https://realtime-api.test")

	var listedWith string
	lister := func(_ context.Context, _ *cobra.Command, accessToken string) ([]Workspace, error) {
		listedWith = accessToken
		return []Workspace{{ID: "ws-1", Name: "My Workspace"}}, nil
	}
	root := newSignupTestCmd(lister)
	useWorkspaceLister(t, lister)
	// An environment token belongs to whichever account set it, not
	// necessarily the one just created.
	t.Setenv("VF_TOKEN", "someone-elses-token")

	out := &strings.Builder{}
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{"auth", "signup", "--email", "you@example.com", "--login-timeout", "15s"})

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := root.ExecuteContext(ctx); err != nil {
		t.Fatalf("vf auth signup: %v\noutput:\n%s", err, out)
	}

	if got := server.lastAuthorizeRequest(t); got.Get("prompt") != "create" || got.Get("login_hint") != "you@example.com" {
		t.Errorf("authorization request = %v, want prompt=create and the login_hint", got)
	}
	session, err := LoadSession()
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if listedWith != session.AccessToken {
		t.Errorf("workspaces listed with %q, want the new session's token %q", listedWith, session.AccessToken)
	}
	for _, want := range []string{"Signed in to " + server.URL, "My Workspace (ws-1)", "Next steps:", "vf workspace list"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("output is missing %q:\n%s", want, out)
		}
	}
}

func TestRunSignupInAgentModeAwaitsSignup(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)
	server.promptValues = []string{"create"}
	useAgentMode(t)

	orig := browserOpener
	browserOpener = func(string) error {
		t.Error("agent mode opened a browser")
		return nil
	}
	t.Cleanup(func() { browserOpener = orig })

	t.Setenv(envIssuer, server.URL)
	t.Setenv(envResource, "https://realtime-api.test")

	lister := func(context.Context, *cobra.Command, string) ([]Workspace, error) {
		return []Workspace{{ID: "ws-1", Name: "My Workspace"}}, nil
	}
	root := newSignupTestCmd(lister)
	useWorkspaceLister(t, lister)

	reader, writer := io.Pipe()
	root.SetOut(io.Discard)
	root.SetErr(writer)
	root.SetArgs([]string{"auth", "signup"})

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		err := root.ExecuteContext(ctx)
		_ = writer.Close()
		done <- err
	}()

	events := json.NewDecoder(reader)

	var awaiting map[string]any
	if err := events.Decode(&awaiting); err != nil {
		t.Fatalf("decode the first signup event: %v", err)
	}
	if awaiting["status"] != "awaiting_signup" {
		t.Fatalf("first event = %v, want an awaiting_signup event", awaiting)
	}
	if awaiting["expires_in"] != DefaultSignupTimeout.String() {
		t.Errorf("expires_in = %v, want the signup timeout", awaiting["expires_in"])
	}
	hints, _ := awaiting["hints"].([]any)
	var joined []string
	for _, h := range hints {
		joined = append(joined, h.(string))
	}
	if !strings.Contains(strings.Join(joined, "\n"), "creates the account in their own browser") {
		t.Errorf("hints = %v, want them to say the user creates the account in their browser", hints)
	}

	authURL, _ := awaiting["authorization_url"].(string)
	if !isSignupURL(authURL) {
		t.Fatalf("authorization_url = %q, want prompt=create", authURL)
	}

	// Stand in for the user finishing signup in their browser.
	resp, err := http.Get(authURL)
	if err != nil {
		t.Fatalf("follow the authorization URL: %v", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	var signedIn map[string]any
	if err := events.Decode(&signedIn); err != nil {
		t.Fatalf("decode the second signup event: %v", err)
	}
	if signedIn["status"] != "signed_in" {
		t.Fatalf("second event = %v, want a signed_in event", signedIn)
	}
	if workspaces, _ := signedIn["workspaces"].([]any); len(workspaces) != 1 {
		t.Errorf("workspaces = %v, want the new account's workspace", signedIn["workspaces"])
	}
	if steps, _ := signedIn["next_steps"].([]any); len(steps) == 0 {
		t.Errorf("signed_in event has no next_steps: %v", signedIn)
	}

	if err := <-done; err != nil {
		t.Fatalf("vf auth signup: %v", err)
	}
}

func TestRunSignupInAgentModeFallsBackWithoutCreate(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t) // advertises no prompt values
	useAgentMode(t)

	t.Setenv(envIssuer, server.URL)
	t.Setenv(envResource, "https://realtime-api.test")

	root := newSignupTestCmd(nil)
	useWorkspaceLister(t, nil)
	errOut := &strings.Builder{}
	root.SetOut(io.Discard)
	root.SetErr(errOut)
	// Nobody signs in, so the wait times out after the first event.
	root.SetArgs([]string{"auth", "signup", "--login-timeout", "100ms"})

	if err := root.ExecuteContext(context.Background()); err == nil {
		t.Fatal("signup succeeded without anyone completing it")
	}

	events := json.NewDecoder(strings.NewReader(errOut.String()))
	var awaiting map[string]any
	if err := events.Decode(&awaiting); err != nil {
		t.Fatalf("decode the first event: %v", err)
	}
	if awaiting["status"] != "awaiting_authorization" {
		t.Errorf("status = %v, want an ordinary login once create is unsupported", awaiting["status"])
	}
	if warnings, _ := awaiting["warnings"].([]any); len(warnings) == 0 {
		t.Errorf("first event = %v, want the fallback reported as a warning", awaiting)
	}

	var failure map[string]any
	if err := events.Decode(&failure); err != nil {
		t.Fatalf("decode the failure event: %v", err)
	}
	if failure["error_type"] != "auth_signup_failed" {
		t.Errorf("error_type = %v, want auth_signup_failed", failure["error_type"])
	}
	hints, _ := json.Marshal(failure["hints"])
	if !strings.Contains(string(hints), "vf auth signup") {
		t.Errorf("hints = %s, want them to retry with vf auth signup", hints)
	}
}
