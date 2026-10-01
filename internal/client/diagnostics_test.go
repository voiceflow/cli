package client

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/voiceflow/cli/internal/output"
)

// output.Error recognizes the stand-in response by this marker, so a dry run
// of an operation that succeeds only with 201 does not report an API error.
func TestDryRunClientMarksItsStandInResponse(t *testing.T) {
	var stderr bytes.Buffer
	req := httptest.NewRequest(http.MethodPost, "https://api.example.com/v1/stable/project", strings.NewReader(`{"name":"n"}`))

	res, err := (&DryRunClient{Stderr: &stderr}).Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if res.Header.Get(output.DryRunResponseHeader) == "" {
		t.Errorf("the stand-in response is not marked with %s", output.DryRunResponseHeader)
	}
	if !strings.Contains(stderr.String(), "[DRY-RUN] Network call skipped.") {
		t.Errorf("no request preview printed:\n%s", stderr.String())
	}
}
