package oauth

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func startTestCallback(t *testing.T, state string) *callbackServer {
	t.Helper()
	// Port 0 lets the OS pick a free port, which keeps concurrent tests apart.
	cb, err := startCallbackServer([]redirectTarget{{Host: "127.0.0.1", Port: 0, Path: callbackPath}}, state)
	if err != nil {
		t.Fatalf("startCallbackServer: %v", err)
	}
	t.Cleanup(cb.Close)
	return cb
}

func TestCallbackServerReturnsCode(t *testing.T) {
	cb := startTestCallback(t, "the-state")

	if !strings.HasSuffix(cb.RedirectURI(), callbackPath) {
		t.Errorf("redirect URI = %q, want it to end in %q", cb.RedirectURI(), callbackPath)
	}
	if strings.Contains(cb.RedirectURI(), ":0/") {
		t.Errorf("redirect URI = %q, want the port actually bound", cb.RedirectURI())
	}

	go func() {
		resp, err := http.Get(cb.RedirectURI() + "?code=the-code&state=the-state")
		if err == nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	code, err := cb.Wait(ctx)
	if err != nil {
		t.Fatalf("Wait: %v", err)
	}
	if code != "the-code" {
		t.Errorf("code = %q, want the-code", code)
	}
}

func TestCallbackServerRejectsStateMismatch(t *testing.T) {
	cb := startTestCallback(t, "the-state")

	go http.Get(cb.RedirectURI() + "?code=the-code&state=forged")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := cb.Wait(ctx); err == nil || !strings.Contains(err.Error(), "state mismatch") {
		t.Fatalf("Wait error = %v, want a state mismatch", err)
	}
}

func TestCallbackServerSurfacesAuthorizationError(t *testing.T) {
	cb := startTestCallback(t, "the-state")

	go http.Get(cb.RedirectURI() + "?error=access_denied&error_description=user+said+no")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := cb.Wait(ctx)
	if err == nil || !strings.Contains(err.Error(), "access_denied") || !strings.Contains(err.Error(), "user said no") {
		t.Fatalf("Wait error = %v, want the server's denial reason", err)
	}
}

func TestCallbackServerEscapesServerSuppliedText(t *testing.T) {
	cb := startTestCallback(t, "the-state")

	resp, err := http.Get(cb.RedirectURI() + "?error=access_denied&error_description=" + "%3Cscript%3Ealert(1)%3C/script%3E")
	if err != nil {
		t.Fatalf("GET callback: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if strings.Contains(string(body), "<script>") {
		t.Errorf("callback page rendered unescaped markup from the query string:\n%s", body)
	}
	if !strings.Contains(string(body), "&lt;script&gt;") {
		t.Errorf("callback page did not escape the description:\n%s", body)
	}
}

func TestCallbackServerWaitHonoursContext(t *testing.T) {
	cb := startTestCallback(t, "the-state")

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	if _, err := cb.Wait(ctx); err == nil {
		t.Fatal("expected Wait to return once the context expires")
	}
}

func TestCallbackServerFailsWhenNoPortIsAvailable(t *testing.T) {
	cb := startTestCallback(t, "the-state")
	target, err := parseRedirectTarget(cb.RedirectURI())
	if err != nil {
		t.Fatalf("parseRedirectTarget: %v", err)
	}

	if _, err := startCallbackServer([]redirectTarget{target}, "other"); err == nil {
		t.Fatal("expected binding an occupied port to fail")
	}
}
