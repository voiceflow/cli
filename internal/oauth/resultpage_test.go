package oauth

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testResultURI = "https://creator.test/oauth2/result"

func TestResultPageAddress(t *testing.T) {
	authorized := loginOutcome{result: resultAuthorized}
	denied := loginOutcome{result: resultDenied}

	tests := []struct {
		name      string
		env       map[string]string
		agentMode bool
		outcome   loginOutcome
		want      string
	}{
		{
			name:    "at a terminal",
			outcome: authorized,
			want:    "client_id=client-1&next=continue&place=this_computer&result=authorized&return_to=voiceflow",
		},
		{
			name:      "for an agent",
			agentMode: true,
			outcome:   authorized,
			want:      "client_id=client-1&next=close&place=this_computer&result=authorized&return_to=voiceflow",
		},
		{
			name:    "a no has nowhere else to go",
			outcome: denied,
			want:    "client_id=client-1&next=continue&place=this_computer&result=denied",
		},
		{
			name:    "a failure says why",
			outcome: loginOutcome{result: resultFailed, reason: reasonNotSaved},
			want:    "client_id=client-1&next=continue&place=this_computer&reason=not_saved&result=failed",
		},
		{
			name:    "in Claude",
			env:     map[string]string{"CLAUDE_CODE_ENTRYPOINT": "claude-desktop"},
			outcome: denied,
			want:    "client_id=client-1&next=continue&place=this_computer&result=denied&return_to=claude",
		},
		{
			name:    "in Claude Code at a terminal",
			env:     map[string]string{"CLAUDE_CODE_ENTRYPOINT": "cli"},
			outcome: denied,
			want:    "client_id=client-1&next=continue&place=this_computer&result=denied",
		},
		{
			name:    "in Cursor",
			env:     map[string]string{"CURSOR_TRACE_ID": "trace", "__CFBundleIdentifier": "com.microsoft.VSCode"},
			outcome: authorized,
			want:    "client_id=client-1&next=continue&place=this_computer&result=authorized&return_to=cursor",
		},
		{
			name:    "in VS Code",
			env:     map[string]string{"__CFBundleIdentifier": "com.microsoft.VSCode"},
			outcome: authorized,
			want:    "client_id=client-1&next=continue&place=this_computer&result=authorized&return_to=vscode",
		},
		{
			name:    "over SSH",
			env:     map[string]string{"SSH_CONNECTION": "10.0.0.1 1 10.0.0.2 22", "CURSOR_TRACE_ID": "trace"},
			outcome: authorized,
			want:    "client_id=client-1&next=continue&result=authorized&return_to=voiceflow",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			page := newResultPage(Metadata{AuthorizationResultURI: testResultURI}, "client-1", envFunc(test.env), test.agentMode)
			if got, want := page.address(test.outcome), testResultURI+"?"+test.want; got != want {
				t.Errorf("address = %s, want %s", got, want)
			}
		})
	}
}

func TestResultPageKeepsTheQueryOfItsAddress(t *testing.T) {
	page := newResultPage(Metadata{AuthorizationResultURI: testResultURI + "?region=eu"}, "client-1", envFunc(nil), false)

	for _, outcome := range []loginOutcome{{result: resultFailed, reason: reasonRefused}, {result: resultDenied}} {
		address, err := url.Parse(page.address(outcome))
		if err != nil {
			t.Fatalf("parse address: %v", err)
		}
		got := address.Query()
		if got.Get("region") != "eu" || got.Get("result") != outcome.result || got.Get("reason") != outcome.reason {
			t.Errorf("query = %v, want the server's own and %v alone", got, outcome)
		}
	}
}

func TestNewResultPageOnlyTakesAPageToSendABrowserTo(t *testing.T) {
	for address, want := range map[string]bool{
		testResultURI:                         true,
		"http://127.0.0.1:3000/oauth2/result": true,
		"http://localhost:3000/oauth2/result": true,
		"http://[::1]:3000/oauth2/result":     true,
		"http://creator.test/oauth2/result":   false,
		"javascript:alert(1)":                 false,
		"cursor://anysphere.cursor-mcp/x":     false,
		"file:///etc/hosts":                   false,
		"//creator.test/oauth2/result":        false,
		"/oauth2/result":                      false,
		"https://":                            false,
		"":                                    false,
	} {
		page := newResultPage(Metadata{AuthorizationResultURI: address}, "client-1", envFunc(nil), false)
		if got := page != nil; got != want {
			t.Errorf("%q taken = %v, want %v", address, got, want)
		}
	}
}

func TestOutcomeOf(t *testing.T) {
	for want, err := range map[loginOutcome]error{
		{result: resultAuthorized}:                        nil,
		{result: resultFailed, reason: reasonRefused}:     fmt.Errorf("exchange: %w", &tokenError{Code: "invalid_grant"}),
		{result: resultFailed, reason: reasonNotSaved}:    fmt.Errorf("%w: %w", ErrStoreSession, errors.New("disk full")),
		{result: resultFailed, reason: reasonUnreachable}: context.DeadlineExceeded,
	} {
		if got := outcomeOf(err); got != want {
			t.Errorf("outcomeOf(%v) = %v, want %v", err, got, want)
		}
	}
}

// browserAnswer is what the browser got, without being sent on.
type browserAnswer struct {
	status   int
	location string
	header   http.Header
	body     string
}

func visit(rawURL string) (browserAnswer, error) {
	client := &http.Client{
		Timeout:       10 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	resp, err := client.Get(rawURL)
	if err != nil {
		return browserAnswer{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	return browserAnswer{
		status:   resp.StatusCode,
		location: resp.Header.Get("Location"),
		header:   resp.Header,
		body:     string(body),
	}, err
}

func mustVisit(t *testing.T, rawURL string) browserAnswer {
	t.Helper()
	answer, err := visit(rawURL)
	if err != nil {
		t.Fatalf("GET %s: %v", rawURL, err)
	}
	return answer
}

func startTestCallbackWithResultPage(t *testing.T, state string) *callbackServer {
	t.Helper()
	cb := startTestCallback(t, state)
	cb.ShowResultOn(newResultPage(Metadata{AuthorizationResultURI: testResultURI}, "client-1", envFunc(nil), false))
	return cb
}

func TestCallbackServerAnswersOnceTheLoginHasEnded(t *testing.T) {
	cb := startTestCallbackWithResultPage(t, "the-state")
	address := cb.RedirectURI() + "?code=the-code&state=the-state"

	// A second tab, or a reload, is told the same.
	answers := make(chan browserAnswer, 2)
	for range 2 {
		go func() {
			answer, _ := visit(address)
			answers <- answer
		}()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := cb.Wait(ctx); err != nil {
		t.Fatalf("Wait: %v", err)
	}
	select {
	case answer := <-answers:
		t.Fatalf("the browser was answered before the login ended: %+v", answer)
	case <-time.After(100 * time.Millisecond):
	}

	cb.Finish(loginOutcome{result: resultAuthorized})
	cb.Finish(loginOutcome{result: resultFailed})

	for range 2 {
		answer := <-answers
		if answer.status != http.StatusFound || !strings.HasPrefix(answer.location, testResultURI+"?") || !strings.Contains(answer.location, "result=authorized") {
			t.Errorf("answer = %d %s, want a redirect to the page that says authorized", answer.status, answer.location)
		}
		if strings.Contains(answer.location, "the-code") || strings.Contains(answer.location, "the-state") {
			t.Errorf("location = %s, want neither the code nor the state in it", answer.location)
		}
		if answer.header.Get("Referrer-Policy") != "no-referrer" || answer.header.Get("Cache-Control") != "no-store" {
			t.Errorf("headers = %v, want the address kept to this browser", answer.header)
		}
	}
}

func TestCallbackServerSendsARefusalToTheResultPage(t *testing.T) {
	for query, want := range map[string]string{
		"error=access_denied&error_description=user+said+no": "result=denied",
		"error=server_error": "reason=refused&result=failed",
		"":                   "reason=refused&result=failed",
	} {
		cb := startTestCallbackWithResultPage(t, "the-state")
		answer := mustVisit(t, cb.RedirectURI()+"?state=the-state&"+query)
		if answer.status != http.StatusFound || !strings.Contains(answer.location, want) {
			t.Errorf("%q: answer = %d %s, want a redirect with %s", query, answer.status, answer.location, want)
		}
		if strings.Contains(answer.location, "said") {
			t.Errorf("%q: location = %s, want none of the server's words in it", query, answer.location)
		}
	}
}

func TestCallbackServerKeepsAStateMismatchOffTheResultPage(t *testing.T) {
	cb := startTestCallbackWithResultPage(t, "the-state")

	answer := mustVisit(t, cb.RedirectURI()+"?code=the-code&state=forged")
	if answer.status != http.StatusBadRequest || answer.location != "" {
		t.Errorf("answer = %d %q, want it refused here", answer.status, answer.location)
	}
}

func TestCallbackServerCloseAnswersABrowserThatWaits(t *testing.T) {
	cb := startTestCallback(t, "the-state")

	answers := make(chan browserAnswer, 1)
	go func() {
		answer, _ := visit(cb.RedirectURI() + "?code=the-code&state=the-state")
		answers <- answer
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := cb.Wait(ctx); err != nil {
		t.Fatalf("Wait: %v", err)
	}
	cb.Close()

	select {
	case answer := <-answers:
		if !strings.Contains(answer.body, "Login failed") {
			t.Errorf("body = %s, want the login that never ended to have failed", answer.body)
		}
	case <-time.After(time.Second):
		t.Fatal("the browser was left waiting")
	}
}

// useVisitingBrowser makes the "browser" go through the sign-in and keeps the
// answer it ends on, with what visited saw when it got there.
func useVisitingBrowser(t *testing.T, onAnswer func()) <-chan browserAnswer {
	t.Helper()
	answers := make(chan browserAnswer, 1)
	orig := browserOpener
	browserOpener = func(rawURL string) error {
		go func() {
			consent, err := visit(rawURL)
			if err != nil {
				return
			}
			answer, err := visit(consent.location)
			if err != nil {
				return
			}
			onAnswer()
			answers <- answer
		}()
		return nil
	}
	t.Cleanup(func() { browserOpener = orig })
	return answers
}

func TestLoginSendsTheBrowserOnOnceTheSessionIsStored(t *testing.T) {
	_, ring := useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)
	server.resultURI = testResultURI

	var stored string
	answers := useVisitingBrowser(t, func() { stored = ring.get(keyringAccessToken) })

	session, err := Login(context.Background(), testEnv(server), LoginOptions{Timeout: 15 * time.Second})
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	answer := <-answers
	want := fmt.Sprintf("%s?client_id=%s&next=continue&place=this_computer&result=authorized&return_to=voiceflow", testResultURI, session.ClientID)
	if answer.location != want {
		t.Errorf("location = %s, want %s", answer.location, want)
	}
	if stored != session.AccessToken {
		t.Errorf("stored token when the browser was told = %q, want %q", stored, session.AccessToken)
	}
}

func TestLoginTellsTheResultPageAnAgentWaits(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)
	server.resultURI = testResultURI
	answers := useVisitingBrowser(t, func() {})

	if _, err := Login(context.Background(), testEnv(server), LoginOptions{Timeout: 15 * time.Second, OnAuthURL: func(string) {}}); err != nil {
		t.Fatalf("Login: %v", err)
	}
	if answer := <-answers; !strings.Contains(answer.location, "next=close") {
		t.Errorf("location = %s, want nothing left to do", answer.location)
	}
}

func TestLoginTellsTheBrowserItFailed(t *testing.T) {
	tests := []struct {
		name      string
		resultURI string
		fail      func(t *testing.T, server *fakeAuthServer, dir string)
		want      string
	}{
		{
			name:      "the code is refused",
			resultURI: testResultURI,
			fail:      func(_ *testing.T, server *fakeAuthServer, _ string) { server.refuseCodes = true },
			want:      "reason=refused&result=failed",
		},
		{
			name:      "the session can't be stored",
			resultURI: testResultURI,
			fail: func(_ *testing.T, _ *fakeAuthServer, dir string) {
				storeDir = func() (string, error) { return filepath.Join(dir, "missing", "\x00"), nil }
			},
			want: "reason=not_saved&result=failed",
		},
		{
			name: "the server has no page",
			fail: func(_ *testing.T, server *fakeAuthServer, _ string) { server.refuseCodes = true },
			want: "Login failed",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dir, _ := useTestStore(t, true)
			useTestHTTPClient(t)
			server := newFakeAuthServer(t)
			server.resultURI = test.resultURI
			answers := useVisitingBrowser(t, func() {})

			_, err := Login(context.Background(), testEnv(server), LoginOptions{
				Timeout:        15 * time.Second,
				observeAuthURL: func(string) { test.fail(t, server, dir) },
			})
			if err == nil {
				t.Fatal("Login succeeded")
			}

			answer := <-answers
			if got := answer.location + answer.body; !strings.Contains(got, test.want) || strings.Contains(got, "Signed in") {
				t.Errorf("answer = %s, want %s", got, test.want)
			}
		})
	}
}

func TestLoginShowsItsOwnPageWithoutAResultPage(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)
	answers := useVisitingBrowser(t, func() {})

	if _, err := Login(context.Background(), testEnv(server), LoginOptions{Timeout: 15 * time.Second}); err != nil {
		t.Fatalf("Login: %v", err)
	}
	if answer := <-answers; answer.status != http.StatusOK || !strings.Contains(answer.body, "Signed in") {
		t.Errorf("answer = %d %s, want the page here", answer.status, answer.body)
	}
}
