package client

import (
	"strings"
	"testing"
)

// The names come from a survey of the OpenAPI spec; see redact.go.
func TestNamesASecret(t *testing.T) {
	secrets := []string{
		// integration credentials
		"apiKey", "apiKeySecret", "keySecret", "secretKey", "oauthSecretKey", "webhookSecret", "webhookSecretKey", "credentials",
		// common spellings, whatever the case or separator
		"password", "secret", "token", "accessToken", "refresh_token", "clientSecret", "client_secret", "API-KEY", "privateKey",
	}
	for _, name := range secrets {
		if !namesASecret(name) {
			t.Errorf("namesASecret(%q) = false, want true", name)
		}
	}

	visible := []string{
		// identifiers that sit next to secrets
		"accountSid", "apiKeySid", "keyId", "clientId", "appId", "accessTokenID", "authHeaderName", "secretIDs", "secretNameToId",
		// token counts
		"maxTokens", "queryTokens", "answerTokens", "tokens",
		// ordinary fields
		"key", "value", "name", "sessionID", "authType", "translationKey", "s3Key",
	}
	for _, name := range visible {
		if namesASecret(name) {
			t.Errorf("namesASecret(%q) = true, want false", name)
		}
	}
}

// The generated rule hid exactly these names. None may become visible.
func TestEveryNameTheGeneratedListHidStaysHidden(t *testing.T) {
	for _, name := range []string{"password", "secret", "token", "access_token", "refresh_token", "api_key", "apikey", "private_key", "client_secret"} {
		if !namesASecret(name) {
			t.Errorf("namesASecret(%q) = false; the generated list hid it", name)
		}
	}
}

func TestRedactBodyHidesSecretsAndKeepsTheRest(t *testing.T) {
	body := `{
		"integration": "twilio",
		"credentials": {"apiKeySid": "SK1", "apiKeySecret": "canary-twilio", "accountSid": "AC1"},
		"headers": [
			{"key": "Authorization", "value": "Bearer canary-header"},
			{"key": "x-api-key", "value": "canary-api-key-header"},
			{"key": "X-Region", "value": "eu-west"}
		],
		"settings": {"clientSecret": "canary-nested", "hasPassword": true, "maxTokens": 512}
	}`

	out := redactBody([]byte(body))

	for _, secret := range []string{"canary-twilio", "canary-header", "canary-api-key-header", "canary-nested"} {
		if strings.Contains(out, secret) {
			t.Errorf("%q leaked:\n%s", secret, out)
		}
	}
	for _, kept := range []string{`"integration": "twilio"`, `"X-Region"`, `"eu-west"`, `"hasPassword": true`, `"maxTokens": 512`} {
		if !strings.Contains(out, kept) {
			t.Errorf("%s was hidden:\n%s", kept, out)
		}
	}
}

func TestRedactRequestBodyHidesTheValueOnSecretEndpoints(t *testing.T) {
	cases := []struct {
		path, body, secret, kept string
	}{
		{"/v2/stable/secret", `{"name":"STRIPE_KEY","defaultValue":"canary-create","visibility":"masked"}`, "canary-create", "STRIPE_KEY"},
		{"/v1/stable/secret/abc123/value", `{"value":"canary-set","environmentAlias":"main"}`, "canary-set", `"environmentAlias": "main"`},
	}
	for _, tc := range cases {
		out := redactRequestBody(tc.path, []byte(tc.body))
		if strings.Contains(out, tc.secret) || !strings.Contains(out, tc.kept) {
			t.Errorf("%s: got\n%s\nwant %q hidden and %q kept", tc.path, out, tc.secret, tc.kept)
		}
	}

	// Elsewhere these fields are ordinary: a variable's default stays visible.
	out := redactRequestBody("/v1/stable/variable", []byte(`{"name":"plan","defaultValue":"free"}`))
	if !strings.Contains(out, `"defaultValue": "free"`) {
		t.Errorf("defaultValue was hidden outside the secret endpoints:\n%s", out)
	}
}
