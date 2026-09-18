package oauth

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func sampleSession() *Session {
	return &Session{
		Issuer:        DefaultIssuer,
		TokenEndpoint: DefaultIssuer + "/v1alpha1/oauth2/token",
		ClientID:      "client-123",
		Resource:      DefaultResource,
		Scope:         "universal.workspace.read",
		TokenType:     "Bearer",
		Expiry:        time.Now().Add(time.Hour).Truncate(time.Second),
		ObtainedAt:    time.Now().Truncate(time.Second),
		AccessToken:   "access-token-value",
		RefreshToken:  "refresh-token-value",
	}
}

func TestSaveSessionUsesKeychainWhenAvailable(t *testing.T) {
	dir, ring := useTestStore(t, true)

	if err := SaveSession(sampleSession()); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	if got := ring.get(keyringAccessToken); got != "access-token-value" {
		t.Errorf("keychain access token = %q, want the stored token", got)
	}
	if got := ring.get(keyringRefreshToken); got != "refresh-token-value" {
		t.Errorf("keychain refresh token = %q, want the stored token", got)
	}

	raw, err := os.ReadFile(filepath.Join(dir, sessionFileName))
	if err != nil {
		t.Fatalf("read session file: %v", err)
	}
	if strings.Contains(string(raw), "access-token-value") || strings.Contains(string(raw), "refresh-token-value") {
		t.Errorf("session file contains token material:\n%s", raw)
	}

	loaded, err := LoadSession()
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if loaded.AccessToken != "access-token-value" || loaded.RefreshToken != "refresh-token-value" {
		t.Errorf("loaded tokens = %q/%q, want the stored pair", loaded.AccessToken, loaded.RefreshToken)
	}
	if loaded.ClientID != "client-123" || loaded.Scope != "universal.workspace.read" {
		t.Errorf("loaded metadata = %+v, want the stored metadata", loaded)
	}
}

func TestSaveSessionFallsBackToFileWithoutKeychain(t *testing.T) {
	dir, _ := useTestStore(t, false)

	if err := SaveSession(sampleSession()); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	path := filepath.Join(dir, sessionFileName)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read session file: %v", err)
	}
	if !strings.Contains(string(raw), "access-token-value") {
		t.Errorf("session file is missing the fallback token:\n%s", raw)
	}

	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat session file: %v", err)
		}
		if mode := info.Mode().Perm(); mode != 0600 {
			t.Errorf("session file mode = %o, want 600", mode)
		}
	}

	loaded, err := LoadSession()
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if loaded.AccessToken != "access-token-value" {
		t.Errorf("loaded access token = %q, want the fallback token", loaded.AccessToken)
	}
}

func TestSaveSessionFallsBackWhenKeychainRejectsTheValue(t *testing.T) {
	// The Windows Credential Manager rejects blobs over 2560 bytes; the store
	// must keep working rather than losing the session.
	dir, ring := useTestStore(t, true)
	ring.setErr = errors.New("credential too large")

	if err := SaveSession(sampleSession()); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(dir, sessionFileName))
	if err != nil {
		t.Fatalf("read session file: %v", err)
	}
	if !strings.Contains(string(raw), "access-token-value") {
		t.Errorf("session file is missing the fallback token:\n%s", raw)
	}
}

func TestLoadSessionWithoutStoredSession(t *testing.T) {
	useTestStore(t, true)

	if _, err := LoadSession(); !errors.Is(err, ErrNoSession) {
		t.Errorf("LoadSession error = %v, want ErrNoSession", err)
	}
}

func TestLoadSessionWhenKeychainEntriesAreGone(t *testing.T) {
	_, ring := useTestStore(t, true)

	if err := SaveSession(sampleSession()); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}
	// Simulate the keychain being cleared behind the CLI's back.
	_ = ring.delete(keyringAccessToken)
	_ = ring.delete(keyringRefreshToken)

	if _, err := LoadSession(); !errors.Is(err, ErrNoSession) {
		t.Errorf("LoadSession error = %v, want ErrNoSession", err)
	}
}

func TestClearSessionRemovesTokensButKeepsClientRegistration(t *testing.T) {
	dir, ring := useTestStore(t, true)

	if err := SaveSession(sampleSession()); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}
	if err := saveClient(&clientRecord{Issuer: DefaultIssuer, ClientID: "client-123", RedirectURIs: defaultRedirectURIs()}); err != nil {
		t.Fatalf("saveClient: %v", err)
	}

	if err := ClearSession(); err != nil {
		t.Fatalf("ClearSession: %v", err)
	}

	if ring.get(keyringAccessToken) != "" || ring.get(keyringRefreshToken) != "" {
		t.Error("keychain still holds token material after ClearSession")
	}
	if _, err := os.Stat(filepath.Join(dir, sessionFileName)); !os.IsNotExist(err) {
		t.Errorf("session file still present after ClearSession (err = %v)", err)
	}

	rec, err := loadClient(DefaultIssuer)
	if err != nil {
		t.Fatalf("loadClient: %v", err)
	}
	if rec == nil || rec.ClientID != "client-123" {
		t.Error("client registration should survive logout so the next login can reuse it")
	}
}

func TestLoadClientIgnoresOtherIssuers(t *testing.T) {
	useTestStore(t, true)

	if err := saveClient(&clientRecord{Issuer: "https://staging.example.com", ClientID: "other"}); err != nil {
		t.Fatalf("saveClient: %v", err)
	}

	rec, err := loadClient(DefaultIssuer)
	if err != nil {
		t.Fatalf("loadClient: %v", err)
	}
	if rec != nil {
		t.Errorf("loadClient returned %+v for a different issuer, want nil", rec)
	}
}
