package oauth

import (
	"crypto/sha256"
	"encoding/base64"
	"testing"
)

func TestNewPKCEProducesS256Challenge(t *testing.T) {
	p, err := newPKCE()
	if err != nil {
		t.Fatalf("newPKCE: %v", err)
	}

	if len(p.verifier) < 43 || len(p.verifier) > 128 {
		t.Errorf("verifier length %d outside the range RFC 7636 allows", len(p.verifier))
	}

	sum := sha256.Sum256([]byte(p.verifier))
	want := base64.RawURLEncoding.EncodeToString(sum[:])
	if p.challenge != want {
		t.Errorf("challenge = %q, want S256 of the verifier (%q)", p.challenge, want)
	}
}

func TestNewPKCEIsUniquePerCall(t *testing.T) {
	seen := map[string]bool{}
	for range 16 {
		p, err := newPKCE()
		if err != nil {
			t.Fatalf("newPKCE: %v", err)
		}
		if seen[p.verifier] {
			t.Fatalf("verifier %q generated twice", p.verifier)
		}
		seen[p.verifier] = true
	}
}
