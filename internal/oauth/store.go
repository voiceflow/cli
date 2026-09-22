package oauth

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/voiceflow/cli/internal/config"
	"github.com/zalando/go-keyring"
)

// ErrNoSession is returned when no OAuth session has been stored, or when the
// stored session was cleared by logout.
var ErrNoSession = errors.New("no OAuth session; run 'vf auth login'")

// Keyring entry names. Access and refresh tokens are stored under separate
// keys rather than as one blob: the Windows Credential Manager caps a
// credential at 2560 bytes, and a JWT pair can exceed that together.
const (
	keyringAccessToken  = "oauth-access-token"
	keyringRefreshToken = "oauth-refresh-token"
)

const (
	sessionFileName = "oauth.json"
	clientFileName  = "oauth-client.json"
	sessionVersion  = 1
)

// Session is a stored OAuth session: the tokens plus everything needed to
// refresh them without re-running discovery.
type Session struct {
	Version       int       `json:"version"`
	Issuer        string    `json:"issuer"`
	TokenEndpoint string    `json:"token_endpoint"`
	ClientID      string    `json:"client_id"`
	Resource      string    `json:"resource,omitempty"`
	Scope         string    `json:"scope,omitempty"`
	TokenType     string    `json:"token_type,omitempty"`
	Expiry        time.Time `json:"expiry,omitempty"`
	ObtainedAt    time.Time `json:"obtained_at,omitempty"`

	// TokensInKeyring records where the secrets live. When true the token
	// fields below are empty on disk and the values come from the OS keychain.
	TokensInKeyring bool `json:"tokens_in_keyring"`

	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

// clientRecord caches a dynamic client registration (RFC 7591) so repeat
// logins reuse the same public client_id. It holds no secret: the
// authorization server issues public clients with no client_secret.
type clientRecord struct {
	Issuer       string   `json:"issuer"`
	ClientID     string   `json:"client_id"`
	RedirectURIs []string `json:"redirect_uris"`
	IssuedAt     int64    `json:"client_id_issued_at,omitempty"`
}

// Indirection points so tests can run against a temp directory and a fake
// keychain instead of the real ones.
var (
	storeDir         = defaultStoreDir
	keyringAvailable = config.KeyringAvailable
	keyringGet       = config.GetKeyringValue
	keyringSet       = config.SetKeyringValue
	keyringDelete    = config.DeleteKeyringValue
)

// defaultStoreDir returns the directory holding the CLI's config file, so
// OAuth state sits beside it (~/.config/vf on Unix and macOS,
// %USERPROFILE%\.config\vf on Windows).
func defaultStoreDir() (string, error) {
	if path := config.GetConfigPath(); path != "" {
		return filepath.Dir(path), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("locate home directory: %w", err)
	}
	return filepath.Join(home, ".config", "vf"), nil
}

// SaveSession persists a session, writing the tokens to the OS keychain when
// one is available and falling back to the 0600 session file otherwise.
func SaveSession(s *Session) error {
	if s == nil {
		return errors.New("save session: nil session")
	}

	stored := *s
	stored.Version = sessionVersion
	stored.TokensInKeyring = writeSecrets(s.AccessToken, s.RefreshToken)
	if stored.TokensInKeyring {
		stored.AccessToken = ""
		stored.RefreshToken = ""
	}
	// Report back where the secrets actually landed; callers render the
	// storage location from the session they passed in.
	s.Version = stored.Version
	s.TokensInKeyring = stored.TokensInKeyring

	return writeJSONFile(sessionFileName, &stored)
}

// writeSecrets stores the tokens in the OS keychain. It returns false when the
// keychain is unavailable or rejects a value, in which case the caller keeps
// the tokens in the session file instead.
func writeSecrets(accessToken, refreshToken string) bool {
	if !keyringAvailable() {
		return false
	}
	if err := keyringSet(keyringAccessToken, accessToken); err != nil {
		return false
	}
	if refreshToken == "" {
		_ = keyringDelete(keyringRefreshToken)
		return true
	}
	if err := keyringSet(keyringRefreshToken, refreshToken); err != nil {
		// Roll back so a stale access token cannot outlive its refresh token.
		_ = keyringDelete(keyringAccessToken)
		return false
	}
	return true
}

// LoadSession reads the stored session, resolving tokens from the keychain
// when that is where they were written. It returns ErrNoSession when nothing
// is stored.
func LoadSession() (*Session, error) {
	var s Session
	found, err := readJSONFile(sessionFileName, &s)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrNoSession
	}

	if s.TokensInKeyring {
		s.AccessToken = keyringGet(keyringAccessToken)
		s.RefreshToken = keyringGet(keyringRefreshToken)
	}
	if s.AccessToken == "" && s.RefreshToken == "" {
		// The file survived but the keychain entries are gone (another
		// machine's sync, a manual keychain purge, a different user).
		return nil, ErrNoSession
	}
	return &s, nil
}

// ClearSession removes the stored session from both the keychain and disk. The
// cached client registration is kept so the next login does not re-register.
//
// Every deletion is attempted, but a keychain failure is reported rather than
// swallowed: dropping the session file while the keychain still holds usable
// tokens would leave credentials behind with no record of where they are. The
// file is kept in that case so a later logout can finish the job.
func ClearSession() error {
	var errs []error
	if keyringAvailable() {
		for _, key := range []string{keyringAccessToken, keyringRefreshToken} {
			// A missing entry is the desired end state, not a failure.
			if err := keyringDelete(key); err != nil && !errors.Is(err, keyring.ErrNotFound) {
				errs = append(errs, fmt.Errorf("remove %s from the OS keychain: %w", key, err))
			}
		}
	}
	if len(errs) > 0 {
		return errors.Join(errs...)
	}
	return removeFile(sessionFileName)
}

func loadClient(issuer string) (*clientRecord, error) {
	var rec clientRecord
	found, err := readJSONFile(clientFileName, &rec)
	if err != nil || !found {
		return nil, err
	}
	if rec.ClientID == "" || rec.Issuer != issuer {
		return nil, nil
	}
	return &rec, nil
}

func saveClient(rec *clientRecord) error {
	return writeJSONFile(clientFileName, rec)
}

func writeJSONFile(name string, value any) error {
	dir, err := storeDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", name, err)
	}
	data = append(data, '\n')

	// Write to a temp file in the same directory, then rename, so a crash
	// mid-write cannot leave a half-written file behind.
	path := filepath.Join(dir, name)
	tmp, err := os.CreateTemp(dir, name+".*")
	if err != nil {
		return fmt.Errorf("create temp file in %s: %w", dir, err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath) // no-op once the rename succeeds

	// Owner-only permissions matter on Unix; Windows ignores the mode, which is
	// acceptable there because the Credential Manager is the primary store.
	_ = tmp.Chmod(0600)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("write %s: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

// readJSONFile decodes name into value. The bool reports whether the file
// existed; a missing file is not an error.
func readJSONFile(name string, value any) (bool, error) {
	dir, err := storeDir()
	if err != nil {
		return false, err
	}
	path := filepath.Join(dir, name)

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("read %s: %w", path, err)
	}
	if err := json.Unmarshal(data, value); err != nil {
		return false, fmt.Errorf("parse %s: %w", path, err)
	}
	return true, nil
}

func removeFile(name string) error {
	dir, err := storeDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dir, name)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove %s: %w", path, err)
	}
	return nil
}

// storageLocation describes where the tokens for a session are kept, for
// display in 'vf auth whoami'.
func (s *Session) storageLocation() string {
	if s.TokensInKeyring {
		return "OS keychain"
	}
	dir, err := storeDir()
	if err != nil {
		return sessionFileName
	}
	return filepath.Join(dir, sessionFileName)
}
