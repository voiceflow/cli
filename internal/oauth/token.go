package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// tokenResponse is the RFC 6749 token endpoint success response.
type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
}

// tokenError is the RFC 6749 token endpoint error response. The authorization
// server also returns generic {message, statusCode} envelopes for some
// failures, so both shapes are decoded.
type tokenError struct {
	Code        string `json:"error"`
	Description string `json:"error_description"`
	Message     string `json:"message"`
	StatusCode  int    `json:"statusCode"`
}

func (e *tokenError) Error() string {
	switch {
	case e.Code != "" && e.Description != "":
		return fmt.Sprintf("%s: %s", e.Code, e.Description)
	case e.Code != "":
		return e.Code
	case e.Message != "":
		return e.Message
	default:
		return "token request failed"
	}
}

// isInvalidGrant reports whether the server rejected the refresh token, which
// means the session is finished and the user has to log in again.
func (e *tokenError) isInvalidGrant() bool {
	return e.Code == "invalid_grant" || e.StatusCode == http.StatusUnauthorized
}

// exchangeCode trades an authorization code for tokens (RFC 6749 §4.1.3) with
// the PKCE verifier and the RFC 8707 resource indicator.
func exchangeCode(ctx context.Context, hc *http.Client, md Metadata, clientID, code, verifier, redirectURI, resource string) (*tokenResponse, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"client_id":     {clientID},
		"code_verifier": {verifier},
	}
	if resource != "" {
		form.Set("resource", resource)
	}
	return postToken(ctx, hc, md.TokenEndpoint, form)
}

// refreshTokens exchanges a refresh token for a fresh access token
// (RFC 6749 §6).
func refreshTokens(ctx context.Context, hc *http.Client, tokenEndpoint, clientID, refreshToken, scope, resource string) (*tokenResponse, error) {
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {clientID},
	}
	if scope != "" {
		form.Set("scope", scope)
	}
	if resource != "" {
		form.Set("resource", resource)
	}
	return postToken(ctx, hc, tokenEndpoint, form)
}

func postToken(ctx context.Context, hc *http.Client, endpoint string, form url.Values) (*tokenResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call token endpoint: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		tokErr := &tokenError{StatusCode: resp.StatusCode}
		if err := json.Unmarshal(body, tokErr); err != nil || (tokErr.Code == "" && tokErr.Message == "") {
			return nil, fmt.Errorf("token endpoint returned %s", resp.Status)
		}
		if tokErr.StatusCode == 0 {
			tokErr.StatusCode = resp.StatusCode
		}
		return nil, tokErr
	}

	var tok tokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}
	if tok.AccessToken == "" {
		return nil, fmt.Errorf("token endpoint returned no access token")
	}
	return &tok, nil
}

// expiry converts the response's relative lifetime into an absolute time.
// A response without expires_in yields the zero time, which is treated as
// "unknown lifetime" — the token is used until the API rejects it.
func (t *tokenResponse) expiry(now time.Time) time.Time {
	if t.ExpiresIn <= 0 {
		return time.Time{}
	}
	return now.Add(time.Duration(t.ExpiresIn) * time.Second)
}
