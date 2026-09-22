package oauth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestMetadataURL(t *testing.T) {
	cases := map[string]string{
		"https://auth-api.voiceflow.com":  "https://auth-api.voiceflow.com/.well-known/oauth-authorization-server",
		"https://auth-api.voiceflow.com/": "https://auth-api.voiceflow.com/.well-known/oauth-authorization-server",
		// RFC 8414: an issuer path is appended after the well-known segment.
		"https://example.com/tenant": "https://example.com/.well-known/oauth-authorization-server/tenant",
	}

	for issuer, want := range cases {
		got, err := metadataURL(issuer)
		if err != nil {
			t.Errorf("metadataURL(%q): %v", issuer, err)
			continue
		}
		if got != want {
			t.Errorf("metadataURL(%q) = %q, want %q", issuer, got, want)
		}
	}

	if _, err := metadataURL("not-a-url"); err == nil {
		t.Error("expected an error for an issuer that is not an absolute URL")
	}
}

// failingTransport makes every request fail, standing in for an unreachable
// discovery endpoint without touching the network.
type failingTransport struct{}

func (failingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("network unreachable")
}

func TestDiscoverFallsBackForTheDefaultIssuer(t *testing.T) {
	// A default-issuer discovery failure still yields the published endpoint
	// layout, alongside the error describing what went wrong.
	client := &http.Client{Transport: failingTransport{}}

	md, err := discover(context.Background(), client, DefaultIssuer)
	if err == nil {
		t.Fatal("expected the discovery failure to be reported")
	}
	if md.TokenEndpoint != fallbackMetadata.TokenEndpoint {
		t.Errorf("token endpoint = %q, want the fallback %q", md.TokenEndpoint, fallbackMetadata.TokenEndpoint)
	}
	if md.AuthorizationEndpoint != fallbackMetadata.AuthorizationEndpoint {
		t.Errorf("authorization endpoint = %q, want the fallback %q", md.AuthorizationEndpoint, fallbackMetadata.AuthorizationEndpoint)
	}
}

func TestDiscoverFailsForAnUnknownIssuer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusNotFound)
	}))
	defer server.Close()

	md, err := discover(context.Background(), server.Client(), server.URL)
	if err == nil {
		t.Fatal("expected discovery against an unknown issuer to fail")
	}
	if md.TokenEndpoint != "" {
		t.Errorf("metadata = %+v, want nothing usable for an unknown issuer", md)
	}
}

func TestDiscoverRejectsAnIncompleteDocument(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"issuer":"https://example.com"}`))
	}))
	defer server.Close()

	if _, err := fetchMetadata(context.Background(), server.Client(), server.URL); err == nil {
		t.Error("expected an error when the document names no endpoints")
	}
}

func TestDiscoverRejectsAMismatchedIssuer(t *testing.T) {
	// RFC 8414 §3.3: metadata naming a different issuer must not be trusted,
	// even though every endpoint in it is well formed.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"issuer":"https://evil.example.com",` +
			`"authorization_endpoint":"https://evil.example.com/authorize",` +
			`"token_endpoint":"https://evil.example.com/token"}`))
	}))
	defer server.Close()

	if _, err := fetchMetadata(context.Background(), server.Client(), server.URL); err == nil ||
		!strings.Contains(err.Error(), "is for issuer") {
		t.Errorf("fetchMetadata error = %v, want the issuer mismatch rejected", err)
	}
}

func TestDiscoverRejectsAMissingIssuer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"authorization_endpoint":"https://a.test/authorize","token_endpoint":"https://a.test/token"}`))
	}))
	defer server.Close()

	if _, err := fetchMetadata(context.Background(), server.Client(), server.URL); err == nil ||
		!strings.Contains(err.Error(), "states no issuer") {
		t.Errorf("fetchMetadata error = %v, want the absent issuer rejected", err)
	}
}

func TestDiscoverAcceptsATrailingSlashOnTheIssuer(t *testing.T) {
	var issuer string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"issuer":%q,"authorization_endpoint":"%s/authorize","token_endpoint":"%s/token"}`,
			issuer+"/", issuer, issuer)
	}))
	defer server.Close()
	issuer = server.URL

	if _, err := fetchMetadata(context.Background(), server.Client(), issuer); err != nil {
		t.Errorf("fetchMetadata: %v, want a trailing slash to be tolerated", err)
	}
}

func TestSupportsS256(t *testing.T) {
	if !(Metadata{}).supportsS256() {
		t.Error("an unstated challenge method should be treated as S256")
	}
	if !(Metadata{CodeChallengeMethodsSupported: []string{"plain", "S256"}}).supportsS256() {
		t.Error("S256 in the list should be detected")
	}
	if (Metadata{CodeChallengeMethodsSupported: []string{"plain"}}).supportsS256() {
		t.Error("a plain-only server should not be treated as S256 capable")
	}
}

func TestAuthorizationURLCarriesEveryRequiredParameter(t *testing.T) {
	md := Metadata{AuthorizationEndpoint: "https://auth.test/authorize"}
	raw := authorizationURL(md, "client-1", "http://127.0.0.1:51330/oauth/callback", "the-state", "the-challenge",
		[]string{"universal.workspace.read", "universal.workspace.write"}, DefaultResource)

	if !strings.HasPrefix(raw, "https://auth.test/authorize?") {
		t.Fatalf("URL = %q, want it built on the authorization endpoint", raw)
	}

	query := mustParseQuery(t, raw)
	want := map[string]string{
		"response_type":         "code",
		"client_id":             "client-1",
		"redirect_uri":          "http://127.0.0.1:51330/oauth/callback",
		"state":                 "the-state",
		"code_challenge":        "the-challenge",
		"code_challenge_method": "S256",
		"scope":                 "universal.workspace.read universal.workspace.write",
		"resource":              DefaultResource,
	}
	for key, value := range want {
		if got := query.Get(key); got != value {
			t.Errorf("%s = %q, want %q", key, got, value)
		}
	}
}

func TestAuthorizationURLKeepsAnExistingQueryString(t *testing.T) {
	md := Metadata{AuthorizationEndpoint: "https://auth.test/authorize?tenant=acme"}
	raw := authorizationURL(md, "client-1", "http://127.0.0.1:51330/oauth/callback", "s", "c", nil, "")

	query := mustParseQuery(t, raw)
	if query.Get("tenant") != "acme" {
		t.Errorf("URL = %q, want the endpoint's own query parameters preserved", raw)
	}
	if query.Get("client_id") != "client-1" {
		t.Errorf("URL = %q, want the login parameters appended", raw)
	}
}

func TestParseRedirectTarget(t *testing.T) {
	target, err := parseRedirectTarget("http://127.0.0.1:51330/oauth/callback")
	if err != nil {
		t.Fatalf("parseRedirectTarget: %v", err)
	}
	if target.address() != "127.0.0.1:51330" || target.Path != "/oauth/callback" {
		t.Errorf("target = %+v, want the host, port, and path split out", target)
	}
	if target.uri() != "http://127.0.0.1:51330/oauth/callback" {
		t.Errorf("uri() = %q, want the original URI", target.uri())
	}

	for _, raw := range []string{
		"https://example.com/callback", // not loopback
		"http://example.com:80/cb",     // not loopback
		"http://127.0.0.1/cb",          // no port
	} {
		if _, err := parseRedirectTarget(raw); err == nil {
			t.Errorf("parseRedirectTarget(%q) succeeded, want an error", raw)
		}
	}
}

func mustParseQuery(t *testing.T, raw string) url.Values {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %q: %v", raw, err)
	}
	return parsed.Query()
}
