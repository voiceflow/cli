package oauth

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestLockRefreshExcludesAnotherHolder(t *testing.T) {
	useTestStore(t, true)

	unlock, err := lockRefresh(context.Background())
	if err != nil {
		t.Fatalf("lockRefresh: %v", err)
	}

	// The lock is held per open file, not per process, so a second acquisition
	// here contends exactly the way a second CLI process would.
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := lockRefresh(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("second lockRefresh error = %v, want it to wait for the first to finish", err)
	}

	unlock()

	waitCtx, waitCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer waitCancel()
	regained, err := lockRefresh(waitCtx)
	if err != nil {
		t.Fatalf("lockRefresh after release: %v", err)
	}
	regained()
}

func TestLockRefreshTimesOutWithoutBlockingForever(t *testing.T) {
	useTestStore(t, true)

	unlock, err := lockRefresh(context.Background())
	if err != nil {
		t.Fatalf("lockRefresh: %v", err)
	}
	defer unlock()

	// A peer that never releases must not wedge the command indefinitely.
	orig := refreshLockDeadline
	refreshLockDeadline = func() time.Time { return time.Now().Add(50 * time.Millisecond) }
	t.Cleanup(func() { refreshLockDeadline = orig })

	if _, err := lockRefresh(context.Background()); err == nil {
		t.Error("lockRefresh succeeded while the lock was held")
	}
}
