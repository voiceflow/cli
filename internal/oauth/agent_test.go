package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"
	"github.com/voiceflow/cli/internal/output"
)

// useAgentMode turns on agent mode for the duration of the test. Agent mode is
// process-global, so it has to be reset afterwards.
func useAgentMode(t *testing.T) {
	t.Helper()
	t.Setenv("FORCE_AGENT_MODE", "1")
	output.ResetAgentMode()
	output.InitAgentMode(&cobra.Command{Use: "vf"})
	t.Cleanup(output.ResetAgentMode)
	if !output.IsAgentMode() {
		t.Fatal("agent mode did not turn on")
	}
}

// agentLoginCmd returns the 'login' command with the flags RunLogin reads,
// writing its output to errOut.
func agentLoginCmd(t *testing.T, ctx context.Context, errOut io.Writer) *cobra.Command {
	t.Helper()
	root := newLoginTestCmd()
	root.SetOut(io.Discard)
	root.SetErr(errOut)
	root.SetArgs([]string{"login"})

	executed, err := root.ExecuteC()
	if err != nil {
		t.Fatalf("execute login: %v", err)
	}
	executed.SetContext(ctx)
	return executed
}

func TestRunLoginInAgentModeHandsOverTheAuthorizationURL(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)
	useAgentMode(t)

	// An agent is not the one signing in, so no browser may be launched.
	orig := browserOpener
	browserOpener = func(string) error {
		t.Error("agent mode opened a browser")
		return nil
	}
	t.Cleanup(func() { browserOpener = orig })

	t.Setenv(envIssuer, server.URL)
	t.Setenv(envResource, "https://realtime-api.test")

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// A pipe lets the test read the first event while login is still waiting
	// for the redirect, which is the whole point of the agent-mode flow.
	reader, writer := io.Pipe()
	cmd := agentLoginCmd(t, ctx, writer)

	done := make(chan error, 1)
	go func() {
		err := RunLogin(cmd)
		_ = writer.Close()
		done <- err
	}()

	events := json.NewDecoder(reader)

	var awaiting map[string]any
	if err := events.Decode(&awaiting); err != nil {
		t.Fatalf("decode the first login event: %v", err)
	}
	if awaiting["status"] != "awaiting_authorization" {
		t.Fatalf("first event = %v, want an awaiting_authorization event", awaiting)
	}
	authURL, _ := awaiting["authorization_url"].(string)
	if !strings.HasPrefix(authURL, server.URL+"/authorize?") {
		t.Fatalf("authorization_url = %q, want the authorization endpoint", authURL)
	}
	if hints, ok := awaiting["hints"].([]any); !ok || len(hints) == 0 {
		t.Errorf("awaiting event carried no hints: %v", awaiting)
	}

	// Stand in for the user opening the URL in their browser.
	resp, err := http.Get(authURL)
	if err != nil {
		t.Fatalf("follow the authorization URL: %v", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	var signedIn map[string]any
	if err := events.Decode(&signedIn); err != nil {
		t.Fatalf("decode the second login event: %v", err)
	}
	if signedIn["status"] != "signed_in" {
		t.Fatalf("second event = %v, want a signed_in event", signedIn)
	}
	if signedIn["issuer"] != server.URL {
		t.Errorf("issuer = %v, want %q", signedIn["issuer"], server.URL)
	}
	if _, ok := signedIn["expires"].(string); !ok {
		t.Errorf("signed_in event has no expires field: %v", signedIn)
	}

	if err := <-done; err != nil {
		t.Fatalf("RunLogin: %v", err)
	}

	// The session the events described is the one later commands read.
	if _, err := AccessToken(context.Background()); err != nil {
		t.Errorf("AccessToken after an agent-mode login: %v", err)
	}
}

func TestRunLoginInAgentModeReportsFailureAsAStructuredError(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)
	useAgentMode(t)

	t.Setenv(envIssuer, server.URL)
	t.Setenv(envResource, "https://realtime-api.test")

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	errOut := &strings.Builder{}
	cmd := agentLoginCmd(t, ctx, errOut)
	// Nobody signs in, so the wait times out.
	if err := cmd.Flags().Set(flagLoginTimeout, "100ms"); err != nil {
		t.Fatalf("set %s: %v", flagLoginTimeout, err)
	}

	err := RunLogin(cmd)
	if err == nil {
		t.Fatal("RunLogin succeeded without anyone completing sign-in")
	}

	events := json.NewDecoder(strings.NewReader(errOut.String()))

	var awaiting map[string]any
	if decodeErr := events.Decode(&awaiting); decodeErr != nil {
		t.Fatalf("decode the first login event: %v", decodeErr)
	}
	if awaiting["status"] != "awaiting_authorization" {
		t.Fatalf("first event = %v, want the URL before the wait", awaiting)
	}

	var failure map[string]any
	if decodeErr := events.Decode(&failure); decodeErr != nil {
		t.Fatalf("decode the failure event: %v", decodeErr)
	}
	if failure["error_type"] != "auth_login_failed" {
		t.Errorf("error_type = %v, want auth_login_failed", failure["error_type"])
	}
	if message, _ := failure["message"].(string); !strings.Contains(message, "timed out") {
		t.Errorf("message = %q, want the timeout reported", message)
	}
}

// A failed authorization and a failed store need opposite advice: the first
// stored nothing and should be retried, the second means the user already
// signed in and credentials may be sitting on the machine half-written.
func TestLoginFailureHintsSeparateAuthorizationFromStorage(t *testing.T) {
	authFailure := loginFailureHints(errors.New("timed out after 5m0s waiting for the browser to complete sign-in"))
	if !strings.Contains(strings.Join(authFailure, "\n"), "no credentials were stored") {
		t.Errorf("hints for a failed authorization = %q, want them to say nothing was stored", authFailure)
	}

	storeFailure := loginFailureHints(fmt.Errorf("%w: %w", ErrStoreSession, errors.New("keychain is locked")))
	joined := strings.Join(storeFailure, "\n")
	if strings.Contains(joined, "no credentials were stored") {
		t.Errorf("hints for a failed store = %q, want them not to claim nothing was stored", storeFailure)
	}
	if !strings.Contains(joined, "vf auth whoami") {
		t.Errorf("hints for a failed store = %q, want them to point at whoami", storeFailure)
	}
	// SaveSession treats the keychain as best-effort, so it can never be the
	// cause here; naming it would send the agent to fix the wrong thing.
	if strings.Contains(strings.ToLower(joined), "keychain") {
		t.Errorf("hints for a failed store = %q, want them not to blame the keychain", storeFailure)
	}
}

func TestProseLinesDropsBlankLines(t *testing.T) {
	got := proseLines("Warning: something\n\n  and more \n")
	want := []string{"Warning: something", "and more"}
	if len(got) != len(want) {
		t.Fatalf("proseLines = %q, want %q", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("proseLines = %q, want %q", got, want)
		}
	}
}
