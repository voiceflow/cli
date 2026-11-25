package run

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"slices"
	"testing"
	"time"

	"github.com/voiceflow/cli/internal/sdk/models/components"
	"github.com/voiceflow/cli/internal/sdk/models/sdkerrors"
)

func TestSplitIDsAcceptsCommasAndRepeatedFlags(t *testing.T) {
	got := splitIDs([]string{"a,b", " c ", "d,,", ""})
	if want := []string{"a", "b", "c", "d"}; !slices.Equal(got, want) {
		t.Fatalf("splitIDs = %q, want %q", got, want)
	}
}

func TestSuiteWaitSecondsStaysWithinWhatTheAPIAccepts(t *testing.T) {
	cases := map[time.Duration]int64{
		30 * time.Minute:        45,
		20 * time.Second:        20,
		1500 * time.Millisecond: 5,
		0:                       5,
		-time.Minute:            5,
	}
	for remaining, want := range cases {
		if got := suiteWaitSeconds(remaining, 0); got != want {
			t.Errorf("suiteWaitSeconds(%s) = %d, want %d", remaining, got, want)
		}
	}
}

func TestSuiteWaitSecondsFitsInsideTheRequestTimeout(t *testing.T) {
	cases := map[time.Duration]int64{
		2 * time.Minute:  45,
		30 * time.Second: 25,
		3 * time.Second:  5,
	}
	for timeout, want := range cases {
		if got := suiteWaitSeconds(30*time.Minute, timeout); got != want {
			t.Errorf("suiteWaitSeconds with --timeout %s = %d, want %d", timeout, got, want)
		}
	}
}

func TestOnlyTransientWaitErrorsAreRetried(t *testing.T) {
	apiError := func(status int) error {
		return fmt.Errorf("wait: %w", sdkerrors.NewSDKDefaultError("API error occurred", status, "{}", nil))
	}
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"server error", apiError(502), true},
		{"rate limited", apiError(429), true},
		{"no answer", &url.Error{Op: "Post", URL: "https://api", Err: errors.New("connection reset")}, true},
		{"request timed out", context.DeadlineExceeded, true},
		{"answer cut off", fmt.Errorf("error reading response body: %w", io.ErrUnexpectedEOF), true},
		{"suite not found", apiError(404), false},
		{"invalid request", apiError(422), false},
		{"anything else", errors.New("boom"), false},
	}
	for _, c := range cases {
		if got := isTransientWaitError(c.err); got != c.want {
			t.Errorf("%s: isTransientWaitError = %t, want %t", c.name, got, c.want)
		}
	}
}

func TestSuiteProgressNamesOnlyWhatHappened(t *testing.T) {
	cases := map[string]components.StableTestRunSuiteCounts{
		"1 of 4 passed, 3 still going":                       {Total: 4, Passed: 1, Unfinished: 3},
		"1 of 4 passed, 1 failed, 1 canceled, 1 still going": {Total: 4, Passed: 1, Failed: 1, Canceled: 1, Unfinished: 1},
	}
	for want, counts := range cases {
		if got := suiteProgress(counts); got != want {
			t.Errorf("suiteProgress = %q, want %q", got, want)
		}
	}
}
