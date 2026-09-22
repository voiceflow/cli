package oauth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

// randomURLSafe returns n cryptographically random bytes encoded as an
// unpadded base64url string.
func randomURLSafe(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate random value: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// pkce holds an RFC 7636 code verifier and its S256 challenge. The
// authorization server advertises S256 as the only supported method, so the
// plain method is deliberately not implemented.
type pkce struct {
	verifier  string
	challenge string
}

func newPKCE() (pkce, error) {
	// 32 random bytes encode to 43 characters, the shortest verifier RFC 7636 allows.
	verifier, err := randomURLSafe(32)
	if err != nil {
		return pkce{}, err
	}
	sum := sha256.Sum256([]byte(verifier))
	return pkce{
		verifier:  verifier,
		challenge: base64.RawURLEncoding.EncodeToString(sum[:]),
	}, nil
}
