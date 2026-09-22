package oauth

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// refreshLockFileName guards the load → refresh → save → cleanup sequence
// against other CLI processes sharing the same stored session.
const refreshLockFileName = "oauth.lock"

const (
	// refreshLockTimeout bounds how long a process waits for a peer that is
	// already refreshing. A refresh is one HTTP round trip, so a peer holding
	// the lock this long is stuck rather than busy.
	refreshLockTimeout = 15 * time.Second
	// refreshLockPoll is the gap between attempts. The lock is only ever held
	// for the length of one token request, so polling is cheap.
	refreshLockPoll = 25 * time.Millisecond
)

// refreshLockDeadline is when to give up waiting for a peer. It is a variable
// so tests do not have to wait out refreshLockTimeout.
var refreshLockDeadline = func() time.Time { return time.Now().Add(refreshLockTimeout) }

// lockRefresh takes an exclusive advisory lock on the store directory's lock
// file and returns the function that releases it. Commands run in parallel
// processes against one rotating refresh token, so the whole refresh has to be
// serialised across processes and not just within one.
func lockRefresh(ctx context.Context) (func(), error) {
	dir, err := storeDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("create %s: %w", dir, err)
	}

	path := filepath.Join(dir, refreshLockFileName)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}

	deadline := refreshLockDeadline()
	for {
		locked, err := tryLockFile(file)
		if err != nil {
			file.Close()
			return nil, fmt.Errorf("lock %s: %w", path, err)
		}
		if locked {
			return func() {
				_ = unlockFile(file)
				_ = file.Close()
			}, nil
		}
		if time.Now().After(deadline) {
			file.Close()
			return nil, fmt.Errorf("timed out waiting for %s", path)
		}

		select {
		case <-ctx.Done():
			file.Close()
			return nil, ctx.Err()
		case <-time.After(refreshLockPoll):
		}
	}
}
