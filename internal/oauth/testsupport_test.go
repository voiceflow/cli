package oauth

import (
	"net/http"
	"sync"
	"testing"
	"time"
)

// fakeKeyring stands in for the OS keychain in tests.
type fakeKeyring struct {
	mu        sync.Mutex
	values    map[string]string
	available bool
	setErr    error
}

func newFakeKeyring(available bool) *fakeKeyring {
	return &fakeKeyring{values: map[string]string{}, available: available}
}

func (f *fakeKeyring) get(key string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.values[key]
}

func (f *fakeKeyring) set(key, value string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.setErr != nil {
		return f.setErr
	}
	f.values[key] = value
	return nil
}

func (f *fakeKeyring) delete(key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.values, key)
	return nil
}

// useTestStore points the store at a temp directory and a fake keychain for
// the duration of the test.
func useTestStore(t *testing.T, available bool) (string, *fakeKeyring) {
	t.Helper()

	dir := t.TempDir()
	ring := newFakeKeyring(available)

	origDir, origAvailable, origGet, origSet, origDelete := storeDir, keyringAvailable, keyringGet, keyringSet, keyringDelete
	storeDir = func() (string, error) { return dir, nil }
	keyringAvailable = func() bool { return ring.available }
	keyringGet = ring.get
	keyringSet = ring.set
	keyringDelete = ring.delete

	t.Cleanup(func() {
		storeDir, keyringAvailable, keyringGet, keyringSet, keyringDelete = origDir, origAvailable, origGet, origSet, origDelete
	})
	return dir, ring
}

// useTestHTTPClient swaps in a client with a short timeout so a hung test
// server fails fast.
func useTestHTTPClient(t *testing.T) {
	t.Helper()
	orig := httpClient
	httpClient = &http.Client{Timeout: 10 * time.Second}
	t.Cleanup(func() { httpClient = orig })
}

// envFunc builds a getenv replacement backed by a map.
func envFunc(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}
