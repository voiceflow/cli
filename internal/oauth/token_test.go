package oauth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestExchangeCodeSendsPKCEAndResource(t *testing.T) {
	var form url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse form: %v", err)
		}
		form = r.PostForm
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"access_token":"at","refresh_token":"rt","token_type":"Bearer","expires_in":3600,"scope":"universal.workspace.read"}`))
	}))
	defer server.Close()

	md := Metadata{TokenEndpoint: server.URL}
	tok, err := exchangeCode(context.Background(), server.Client(), md, "client-1", "the-code", "the-verifier", "http://127.0.0.1:51330/oauth/callback", DefaultResource)
	if err != nil {
		t.Fatalf("exchangeCode: %v", err)
	}

	want := map[string]string{
		"grant_type":    "authorization_code",
		"code":          "the-code",
		"client_id":     "client-1",
		"code_verifier": "the-verifier",
		"redirect_uri":  "http://127.0.0.1:51330/oauth/callback",
		"resource":      DefaultResource,
	}
	for key, value := range want {
		if got := form.Get(key); got != value {
			t.Errorf("form[%s] = %q, want %q", key, got, value)
		}
	}

	if tok.AccessToken != "at" || tok.RefreshToken != "rt" {
		t.Errorf("tokens = %q/%q, want at/rt", tok.AccessToken, tok.RefreshToken)
	}
	now := time.Now()
	if got := tok.expiry(now); got.Sub(now) != time.Hour {
		t.Errorf("expiry = %v, want one hour out", got)
	}
}

func TestExpiryIsZeroWithoutExpiresIn(t *testing.T) {
	tok := &tokenResponse{AccessToken: "at"}
	if got := tok.expiry(time.Now()); !got.IsZero() {
		t.Errorf("expiry = %v, want the zero time when the server states no lifetime", got)
	}
}

func TestRefreshTokensReportsInvalidGrant(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid_grant","error_description":"refresh token expired"}`))
	}))
	defer server.Close()

	_, err := refreshTokens(context.Background(), server.Client(), server.URL, "client-1", "rt", "", "")
	var tokErr *tokenError
	if !errors.As(err, &tokErr) {
		t.Fatalf("error = %v, want a *tokenError", err)
	}
	if !tokErr.isInvalidGrant() {
		t.Errorf("isInvalidGrant() = false for %v", tokErr)
	}
	if tokErr.Error() != "invalid_grant: refresh token expired" {
		t.Errorf("message = %q, want the server's description", tokErr.Error())
	}
}

func TestPostTokenTreatsUnauthorizedAsInvalidGrant(t *testing.T) {
	// The Voiceflow token endpoint answers a bad code with a bare 401 envelope
	// rather than an RFC 6749 error body.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Unauthorized","statusCode":401}`))
	}))
	defer server.Close()

	_, err := refreshTokens(context.Background(), server.Client(), server.URL, "client-1", "rt", "", "")
	var tokErr *tokenError
	if !errors.As(err, &tokErr) || !tokErr.isInvalidGrant() {
		t.Fatalf("error = %v, want an invalid-grant *tokenError", err)
	}
}

func TestPostTokenRejectsResponseWithoutAccessToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"token_type":"Bearer"}`))
	}))
	defer server.Close()

	if _, err := refreshTokens(context.Background(), server.Client(), server.URL, "client-1", "rt", "", ""); err == nil {
		t.Fatal("expected an error when the response carries no access token")
	}
}
