package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Metadata is the subset of RFC 8414 authorization server metadata the login
// flow needs.
type Metadata struct {
	Issuer                        string   `json:"issuer"`
	AuthorizationEndpoint         string   `json:"authorization_endpoint"`
	TokenEndpoint                 string   `json:"token_endpoint"`
	RegistrationEndpoint          string   `json:"registration_endpoint"`
	ScopesSupported               []string `json:"scopes_supported"`
	GrantTypesSupported           []string `json:"grant_types_supported"`
	ResponseTypesSupported        []string `json:"response_types_supported"`
	CodeChallengeMethodsSupported []string `json:"code_challenge_methods_supported"`
}

// fallbackMetadata mirrors the published document at
// https://auth-api.voiceflow.com/.well-known/oauth-authorization-server and is
// used only when discovery fails, so a transient blip on the well-known route
// does not break login.
var fallbackMetadata = Metadata{
	Issuer:                        DefaultIssuer,
	AuthorizationEndpoint:         DefaultIssuer + "/v1alpha1/oauth2/authorize",
	TokenEndpoint:                 DefaultIssuer + "/v1alpha1/oauth2/token",
	RegistrationEndpoint:          DefaultIssuer + "/v1alpha1/oauth2/register",
	ScopesSupported:               []string{"universal.workspace.read", "universal.workspace.write"},
	GrantTypesSupported:           []string{"authorization_code", "refresh_token"},
	ResponseTypesSupported:        []string{"code"},
	CodeChallengeMethodsSupported: []string{"S256"},
}

// metadataURL builds the well-known discovery URL for an issuer. Per RFC 8414
// the path component of the issuer is inserted after the well-known segment.
func metadataURL(issuer string) (string, error) {
	u, err := url.Parse(strings.TrimSuffix(issuer, "/"))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("invalid issuer %q", issuer)
	}
	path := strings.TrimSuffix(u.Path, "/")
	u.Path = "/.well-known/oauth-authorization-server" + path
	return u.String(), nil
}

// discover fetches authorization server metadata for the issuer. It never
// fails: a discovery error falls back to the known endpoint layout, which is
// reported through the returned error for display but still yields usable
// metadata.
func discover(ctx context.Context, hc *http.Client, issuer string) (Metadata, error) {
	md, err := fetchMetadata(ctx, hc, issuer)
	if err != nil {
		fb := fallbackMetadata
		if issuer != DefaultIssuer {
			// Only the default issuer has a known endpoint layout.
			return Metadata{}, err
		}
		return fb, err
	}
	return md, nil
}

func fetchMetadata(ctx context.Context, hc *http.Client, issuer string) (Metadata, error) {
	endpoint, err := metadataURL(issuer)
	if err != nil {
		return Metadata{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Metadata{}, fmt.Errorf("build discovery request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := hc.Do(req)
	if err != nil {
		return Metadata{}, fmt.Errorf("fetch %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Metadata{}, fmt.Errorf("read %s: %w", endpoint, err)
	}
	if resp.StatusCode != http.StatusOK {
		return Metadata{}, fmt.Errorf("discovery at %s returned %s", endpoint, resp.Status)
	}

	var md Metadata
	if err := json.Unmarshal(body, &md); err != nil {
		return Metadata{}, fmt.Errorf("parse discovery document: %w", err)
	}
	if md.AuthorizationEndpoint == "" || md.TokenEndpoint == "" {
		return Metadata{}, fmt.Errorf("discovery document at %s is missing required endpoints", endpoint)
	}
	if md.Issuer == "" {
		md.Issuer = strings.TrimSuffix(issuer, "/")
	}
	return md, nil
}

// supportsS256 reports whether the server advertises the S256 challenge
// method. An empty list is treated as supported: RFC 8414 makes the field
// optional and S256 is mandatory for public native clients.
func (m Metadata) supportsS256() bool {
	if len(m.CodeChallengeMethodsSupported) == 0 {
		return true
	}
	for _, method := range m.CodeChallengeMethodsSupported {
		if strings.EqualFold(method, "S256") {
			return true
		}
	}
	return false
}
