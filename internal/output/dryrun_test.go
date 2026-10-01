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

// reportError runs Error and returns what it returned and printed.
func reportError(t *testing.T, err error) (error, string) {
	t.Helper()
	var stderr bytes.Buffer
	cmd := &cobra.Command{Use: "vf"}
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

			got, printed := reportError(t, statusError(standInHeader()))
			if got != nil || printed != "" {
				t.Fatalf("Error = %v, printed %q; want nil and nothing printed", got, printed)
			}
		})
	}
}

func TestErrorStillReportsEveryOtherError(t *testing.T) {
	ResetAgentMode()
	t.Cleanup(ResetAgentMode)

	for name, err := range map[string]error{
		"a response the API sent":     statusError(http.Header{"Content-Type": {"application/json"}}),
		"an error before the preview": errors.New("error serializing request body: boom"),
	} {
		t.Run(name, func(t *testing.T) {
			got, printed := reportError(t, err)
			if got == nil || printed == "" {
				t.Fatalf("Error = %v, printed %q; want the error returned and reported", got, printed)
			}
		})
	}
}
