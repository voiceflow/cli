package output

import (
	"bytes"
	"errors"
	"net/http"
	"testing"

	"github.com/spf13/cobra"
	"github.com/voiceflow/cli/internal/sdk/models/sdkerrors"
)

// statusError is what the SDK returns for a response whose status code the
// operation does not expect, as a 201-only operation does for a dry run's 200.
func statusError(header http.Header) error {
	res := &http.Response{StatusCode: http.StatusOK, Status: "200 OK", Header: header}
	return sdkerrors.NewSDKDefaultError("unknown status code returned", http.StatusOK, "{}", res)
}

func standInHeader() http.Header {
	header := http.Header{}
	header.Set("Content-Type", "application/json")
	header.Set(DryRunResponseHeader, "true")
	return header
}

// reportError runs Error, with or without --dry-run, and returns what it
// returned and printed.
func reportError(t *testing.T, err error, isDryRun bool) (error, string) {
	t.Helper()
	var stderr bytes.Buffer
	cmd := &cobra.Command{Use: "vf"}
	cmd.Flags().Bool("dry-run", false, "")
	if isDryRun {
		if setErr := cmd.Flags().Set("dry-run", "true"); setErr != nil {
			t.Fatal(setErr)
		}
	}
	cmd.SetErr(&stderr)
	return Error(cmd, err), stderr.String()
}

func TestErrorIgnoresTheDryRunStandInResponse(t *testing.T) {
	for name, isAgentMode := range map[string]bool{"human mode": false, "agent mode": true} {
		t.Run(name, func(t *testing.T) {
			ResetAgentMode()
			t.Cleanup(ResetAgentMode)
			if isAgentMode {
				t.Setenv("FORCE_AGENT_MODE", "1")
				InitAgentMode(&cobra.Command{Use: "vf"})
			}

			got, printed := reportError(t, statusError(standInHeader()), true)
			if got != nil || printed != "" {
				t.Fatalf("Error = %v, printed %q; want nil and nothing printed", got, printed)
			}
		})
	}
}

func TestErrorStillReportsEveryOtherError(t *testing.T) {
	ResetAgentMode()
	t.Cleanup(ResetAgentMode)

	cases := []struct {
		name     string
		err      error
		isDryRun bool
	}{
		{"a response the API sent", statusError(http.Header{"Content-Type": {"application/json"}}), true},
		{"an error before the preview", errors.New("error serializing request body: boom"), true},
		// The marker is a header any server could send; outside a dry run it
		// must not turn that server's error into a success.
		{"a marked response without --dry-run", statusError(standInHeader()), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, printed := reportError(t, tc.err, tc.isDryRun)
			if got == nil || printed == "" {
				t.Fatalf("Error = %v, printed %q; want the error returned and reported", got, printed)
			}
		})
	}
}
