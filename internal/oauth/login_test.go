package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeAuthServer is a minimal stand-in for the Voiceflow authorization server:
// discovery, dynamic registration, an authorization endpoint that redirects
// back to the loopback receiver, and a token endpoint that verifies PKCE.
type fakeAuthServer struct {
	*httptest.Server

	mu                sync.Mutex
	registrations     int
	clients           map[string][]string // client_id -> registered redirect URIs
	codes             map[string]pendingCode
	refreshTokens     map[string]string // refresh token -> client_id
	issued            int
	authorizeRequests []url.Values
	accessTokenTTL    int64
	rotateRefresh     bool
}

type pendingCode struct {
	clientID    string
	challenge   string
	redirectURI string
	scope       string
}

func newFakeAuthServer(t *testing.T) *fakeAuthServer {
	t.Helper()

	f := &fakeAuthServer{
		clients:        map[string][]string{},
		codes:          map[string]pendingCode{},
		refreshTokens:  map[string]string{},
		accessTokenTTL: 3600,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/oauth-authorization-server", f.handleDiscovery)
	mux.HandleFunc("/register", f.handleRegister)
	mux.HandleFunc("/authorize", f.handleAuthorize)
	mux.HandleFunc("/token", f.handleToken)

	f.Server = httptest.NewServer(mux)
	t.Cleanup(f.Close)
	return f
}

func (f *fakeAuthServer) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, Metadata{
		Issuer:                        f.URL,
		AuthorizationEndpoint:         f.URL + "/authorize",
		TokenEndpoint:                 f.URL + "/token",
		RegistrationEndpoint:          f.URL + "/register",
		ScopesSupported:               []string{"universal.workspace.read", "universal.workspace.write"},
		GrantTypesSupported:           []string{"authorization_code", "refresh_token"},
		ResponseTypesSupported:        []string{"code"},
		CodeChallengeMethodsSupported: []string{"S256"},
	})
}

func (f *fakeAuthServer) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_client_metadata"})
		return
	}

	f.mu.Lock()
	f.registrations++
	clientID := fmt.Sprintf("client-%d", f.registrations)
	f.clients[clientID] = req.RedirectURIs
	f.mu.Unlock()

	writeJSON(w, http.StatusCreated, registrationResponse{
		ClientID:         clientID,
		RedirectURIs:     req.RedirectURIs,
		ClientIDIssuedAt: 1,
	})
}

func (f *fakeAuthServer) handleAuthorize(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	f.mu.Lock()
	f.authorizeRequests = append(f.authorizeRequests, query)
	registered, known := f.clients[query.Get("client_id")]
	f.mu.Unlock()

	redirectURI := query.Get("redirect_uri")
	switch {
	case !known:
		http.Error(w, "unknown client", http.StatusBadRequest)
		return
	case !contains(registered, redirectURI):
		http.Error(w, "unregistered redirect_uri", http.StatusBadRequest)
		return
	case query.Get("response_type") != "code",
		query.Get("code_challenge_method") != "S256",
		query.Get("code_challenge") == "",
		query.Get("state") == "",
		query.Get("resource") == "":
		http.Error(w, "invalid authorization request", http.StatusBadRequest)
		return
	}

	f.mu.Lock()
	f.issued++
	code := fmt.Sprintf("code-%d", f.issued)
	f.codes[code] = pendingCode{
		clientID:    query.Get("client_id"),
		challenge:   query.Get("code_challenge"),
		redirectURI: redirectURI,
		scope:       query.Get("scope"),
	}
	f.mu.Unlock()

	location := fmt.Sprintf("%s?code=%s&state=%s", redirectURI, url.QueryEscape(code), url.QueryEscape(query.Get("state")))
	http.Redirect(w, r, location, http.StatusFound)
}

func (f *fakeAuthServer) handleToken(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request"})
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	var clientID, scope string
	switch r.PostForm.Get("grant_type") {
	case "authorization_code":
		pending, ok := f.codes[r.PostForm.Get("code")]
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant"})
			return
		}
		delete(f.codes, r.PostForm.Get("code")) // authorization codes are single use
		sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
		if base64.RawURLEncoding.EncodeToString(sum[:]) != pending.challenge {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant", "error_description": "PKCE verification failed"})
			return
		}
		if r.PostForm.Get("redirect_uri") != pending.redirectURI {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant", "error_description": "redirect_uri mismatch"})
			return
		}
		clientID, scope = pending.clientID, pending.scope

	case "refresh_token":
		owner, ok := f.refreshTokens[r.PostForm.Get("refresh_token")]
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"message": "Unauthorized", "statusCode": 401})
			return
		}
		clientID, scope = owner, r.PostForm.Get("scope")

	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported_grant_type"})
		return
	}

	f.issued++
	accessToken := fmt.Sprintf("access-%d", f.issued)
	refreshToken := fmt.Sprintf("refresh-%d", f.issued)
	if !f.rotateRefresh && r.PostForm.Get("grant_type") == "refresh_token" {
		refreshToken = ""
	}
	if refreshToken != "" {
		f.refreshTokens[refreshToken] = clientID
	}

	writeJSON(w, http.StatusOK, tokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    f.accessTokenTTL,
		Scope:        scope,
	})
}

func (f *fakeAuthServer) lastAuthorizeRequest(t *testing.T) url.Values {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.authorizeRequests) == 0 {
		t.Fatal("the authorization endpoint was never called")
	}
	return f.authorizeRequests[len(f.authorizeRequests)-1]
}

func (f *fakeAuthServer) registrationCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.registrations
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

// useFakeBrowser makes the "browser" fetch the authorization URL, which
// drives the redirect back to the loopback receiver.
func useFakeBrowser(t *testing.T) {
	t.Helper()
	orig := browserOpener
	browserOpener = func(rawURL string) error {
		go func() {
			resp, err := http.Get(rawURL)
			if err != nil {
				return
			}
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}()
		return nil
	}
	t.Cleanup(func() { browserOpener = orig })
}

func testEnv(server *fakeAuthServer) func(string) string {
	return envFunc(map[string]string{
		envIssuer:   server.URL,
		envResource: "https://realtime-api.test",
	})
}

func TestLoginStoresASessionEndToEnd(t *testing.T) {
	_, ring := useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)

	out := &strings.Builder{}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	session, err := Login(ctx, testEnv(server), LoginOptions{Out: out, Timeout: 15 * time.Second})
	if err != nil {
		t.Fatalf("Login: %v\noutput:\n%s", err, out)
	}

	if session.AccessToken == "" || session.RefreshToken == "" {
		t.Errorf("session tokens = %q/%q, want both set", session.AccessToken, session.RefreshToken)
	}
	if session.TokenEndpoint != server.URL+"/token" {
		t.Errorf("token endpoint = %q, want the discovered endpoint", session.TokenEndpoint)
	}
	if session.Resource != "https://realtime-api.test" {
		t.Errorf("resource = %q, want the configured resource indicator", session.Resource)
	}
	if ring.get(keyringAccessToken) != session.AccessToken {
		t.Error("access token was not written to the keychain")
	}

	authorize := server.lastAuthorizeRequest(t)
	if authorize.Get("code_challenge_method") != "S256" || authorize.Get("code_challenge") == "" {
		t.Errorf("authorization request did not use PKCE S256: %v", authorize)
	}
	if authorize.Get("resource") != "https://realtime-api.test" {
		t.Errorf("authorization request resource = %q, want the configured resource", authorize.Get("resource"))
	}
	if got := authorize.Get("scope"); got != "universal.workspace.read universal.workspace.write" {
		t.Errorf("scope = %q, want the scopes the server advertises", got)
	}

	// The stored session is what later commands read.
	token, err := AccessToken(context.Background())
	if err != nil {
		t.Fatalf("AccessToken: %v", err)
	}
	if token != session.AccessToken {
		t.Errorf("AccessToken = %q, want the freshly stored token %q", token, session.AccessToken)
	}
}

func TestLoginRequestsExplicitScopes(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if _, err := Login(ctx, testEnv(server), LoginOptions{Scopes: []string{"universal.workspace.read"}, Timeout: 15 * time.Second}); err != nil {
		t.Fatalf("Login: %v", err)
	}

	if got := server.lastAuthorizeRequest(t).Get("scope"); got != "universal.workspace.read" {
		t.Errorf("scope = %q, want only the requested scope", got)
	}
}

func TestLoginReusesTheCachedClientRegistration(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for i := range 2 {
		if _, err := Login(ctx, testEnv(server), LoginOptions{Timeout: 15 * time.Second}); err != nil {
			t.Fatalf("Login %d: %v", i+1, err)
		}
	}

	if got := server.registrationCount(); got != 1 {
		t.Errorf("registrations = %d, want the second login to reuse the cached client", got)
	}
}

func TestLoginUsesAPreRegisteredClientID(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)

	// Pre-register the client out of band, as a deployment with a fixed
	// client ID would.
	redirectURIs := defaultRedirectURIs()
	server.mu.Lock()
	server.clients["preset-client"] = redirectURIs
	server.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	getenv := envFunc(map[string]string{
		envIssuer:   server.URL,
		envResource: "https://realtime-api.test",
		envClientID: "preset-client",
	})

	session, err := Login(ctx, getenv, LoginOptions{Timeout: 15 * time.Second})
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if session.ClientID != "preset-client" {
		t.Errorf("client ID = %q, want the configured client", session.ClientID)
	}
	if got := server.registrationCount(); got != 0 {
		t.Errorf("registrations = %d, want none when a client ID is configured", got)
	}
}

func TestLoginTimesOutWaitingForTheBrowser(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)

	// A browser that never completes the redirect.
	orig := browserOpener
	browserOpener = func(string) error { return nil }
	t.Cleanup(func() { browserOpener = orig })

	_, err := Login(context.Background(), testEnv(server), LoginOptions{Timeout: 100 * time.Millisecond})
	if err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("Login error = %v, want a timeout", err)
	}
}

func TestAccessTokenRefreshesAnExpiringSession(t *testing.T) {
	_, ring := useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)
	server.rotateRefresh = true

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	session, err := Login(ctx, testEnv(server), LoginOptions{Timeout: 15 * time.Second})
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	// Push the stored session inside the refresh window.
	session.Expiry = time.Now().Add(10 * time.Second)
	if err := SaveSession(session); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	refreshed, err := AccessToken(context.Background())
	if err != nil {
		t.Fatalf("AccessToken: %v", err)
	}
	if refreshed == session.AccessToken {
		t.Error("AccessToken returned the old token instead of refreshing")
	}
	if ring.get(keyringAccessToken) != refreshed {
		t.Error("the refreshed token was not persisted to the keychain")
	}

	stored, err := LoadSession()
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if stored.RefreshToken == session.RefreshToken {
		t.Error("the rotated refresh token was not persisted")
	}
	if !stored.Expiry.After(time.Now().Add(time.Hour - time.Minute)) {
		t.Errorf("expiry = %v, want it extended by the refresh", stored.Expiry)
	}
}

func TestAccessTokenKeepsTheOldRefreshTokenWhenTheServerDoesNotRotate(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	useFakeBrowser(t)
	server := newFakeAuthServer(t)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	session, err := Login(ctx, testEnv(server), LoginOptions{Timeout: 15 * time.Second})
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	session.Expiry = time.Now().Add(10 * time.Second)
	if err := SaveSession(session); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}
	if _, err := AccessToken(context.Background()); err != nil {
		t.Fatalf("AccessToken: %v", err)
	}

	stored, err := LoadSession()
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if stored.RefreshToken != session.RefreshToken {
		t.Errorf("refresh token = %q, want the original %q retained", stored.RefreshToken, session.RefreshToken)
	}
}

func TestAccessTokenClearsTheSessionWhenTheRefreshTokenIsRejected(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)
	server := newFakeAuthServer(t)

	expired := &Session{
		Issuer:        server.URL,
		TokenEndpoint: server.URL + "/token",
		ClientID:      "client-1",
		Expiry:        time.Now().Add(-time.Hour),
		AccessToken:   "stale-access",
		RefreshToken:  "unknown-refresh",
	}
	if err := SaveSession(expired); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	if _, err := AccessToken(context.Background()); err == nil || !strings.Contains(err.Error(), "vf auth login") {
		t.Fatalf("AccessToken error = %v, want a prompt to log in again", err)
	}
	if _, err := LoadSession(); !errors.Is(err, ErrNoSession) {
		t.Errorf("LoadSession error = %v, want the rejected session to have been cleared", err)
	}
}

func TestAccessTokenKeepsAValidTokenWhenRefreshFailsTransiently(t *testing.T) {
	useTestStore(t, true)
	useTestHTTPClient(t)

	// A token endpoint that is unreachable, standing in for a network blip.
	unreachable := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	endpoint := unreachable.URL + "/token"
	unreachable.Close()

	session := &Session{
		Issuer:        "https://auth.test",
		TokenEndpoint: endpoint,
		ClientID:      "client-1",
		// Inside the refresh window but not yet expired.
		Expiry:       time.Now().Add(30 * time.Second),
		AccessToken:  "still-valid",
		RefreshToken: "refresh",
	}
	if err := SaveSession(session); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	token, err := AccessToken(context.Background())
	if err != nil {
		t.Fatalf("AccessToken: %v", err)
	}
	if token != "still-valid" {
		t.Errorf("AccessToken = %q, want the still-valid token to be reused", token)
	}
}

func TestAccessTokenWithoutASession(t *testing.T) {
	useTestStore(t, true)

	if _, err := AccessToken(context.Background()); !errors.Is(err, ErrNoSession) {
		t.Errorf("AccessToken error = %v, want ErrNoSession", err)
	}
}

func TestLogoutClearsTheSession(t *testing.T) {
	useTestStore(t, true)

	if err := SaveSession(sampleSession()); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}
	if status := CurrentStatus(); !status.LoggedIn {
		t.Fatal("CurrentStatus reports signed out with a session stored")
	}

	if err := Logout(); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if status := CurrentStatus(); status.LoggedIn {
		t.Error("CurrentStatus still reports a session after logout")
	}
}
