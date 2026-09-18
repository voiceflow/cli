package oauth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// registrationRequest is an RFC 7591 dynamic client registration request for a
// native, public client using the authorization code flow with PKCE.
type registrationRequest struct {
	ClientName              string   `json:"client_name"`
	RedirectURIs            []string `json:"redirect_uris"`
	GrantTypes              []string `json:"grant_types"`
	ResponseTypes           []string `json:"response_types"`
	TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	ApplicationType         string   `json:"application_type"`
}

type registrationResponse struct {
	ClientID         string   `json:"client_id"`
	ClientSecret     string   `json:"client_secret"`
	RedirectURIs     []string `json:"redirect_uris"`
	ClientIDIssuedAt int64    `json:"client_id_issued_at"`
	Error            string   `json:"error"`
	ErrorDescription string   `json:"error_description"`
	Message          string   `json:"message"`
}

// registerClient registers a public client for the given redirect URIs and
// returns the issued client_id. The authorization server advertises
// token_endpoint_auth_method "none", so no client secret is issued or stored.
func registerClient(ctx context.Context, hc *http.Client, md Metadata, clientName string, redirectURIs []string) (*clientRecord, error) {
	if md.RegistrationEndpoint == "" {
		return nil, fmt.Errorf("authorization server does not support dynamic client registration; set %s to a pre-registered client ID", envClientID)
	}

	payload, err := json.Marshal(registrationRequest{
		ClientName:              clientName,
		RedirectURIs:            redirectURIs,
		GrantTypes:              []string{"authorization_code", "refresh_token"},
		ResponseTypes:           []string{"code"},
		TokenEndpointAuthMethod: "none",
		ApplicationType:         "native",
	})
	if err != nil {
		return nil, fmt.Errorf("encode registration request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, md.RegistrationEndpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build registration request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("register client: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read registration response: %w", err)
	}

	var out registrationResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("parse registration response: %w", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		switch {
		case out.ErrorDescription != "":
			return nil, fmt.Errorf("register client: %s", out.ErrorDescription)
		case out.Error != "":
			return nil, fmt.Errorf("register client: %s", out.Error)
		case out.Message != "":
			return nil, fmt.Errorf("register client: %s", out.Message)
		default:
			return nil, fmt.Errorf("register client: %s", resp.Status)
		}
	}
	if out.ClientID == "" {
		return nil, fmt.Errorf("register client: response contained no client_id")
	}

	registered := out.RedirectURIs
	if len(registered) == 0 {
		registered = redirectURIs
	}
	return &clientRecord{
		Issuer:       md.Issuer,
		ClientID:     out.ClientID,
		RedirectURIs: registered,
		IssuedAt:     out.ClientIDIssuedAt,
	}, nil
}
