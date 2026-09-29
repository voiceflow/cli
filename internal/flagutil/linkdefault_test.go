package flagutil

import (
	"reflect"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// linkedRequest has the two shapes a linked flag lands in: a required query
// parameter (ProjectID) and an optional field in the JSON body
// (Body.EnvironmentAlias), as in `vf transcript search`.
type linkedRequest struct {
	ProjectID string
	Body      linkedBody `request:"mediaType=application/json"`
}

type linkedBody struct {
	EnvironmentAlias *string `json:"environmentAlias,omitempty"`
	SessionID        *string `json:"sessionID,omitempty"`
}

var linkedMeta = []FlagMeta{
	{FlagName: "project-id", FieldPath: "ProjectID", Kind: FlagKindString, Required: true},
	{FlagName: "environment-alias", FieldPath: "Body.EnvironmentAlias", Kind: FlagKindString, Optional: true},
	{FlagName: "session-id", FieldPath: "Body.SessionID", Kind: FlagKindString, Optional: true},
}

// buildLinked parses args, applies the link's values the way internal/link
// does, and builds the request. stdin is empty unless given.
func buildLinked(t *testing.T, stdin string, args ...string) *linkedRequest {
	t.Helper()
	cmd := &cobra.Command{Use: "search"}
	RegisterFlags(cmd, linkedMeta)
	cmd.Flags().String("body", "", "")
	cmd.SetIn(strings.NewReader(stdin))
	if err := cmd.Flags().Parse(args); err != nil {
		t.Fatal(err)
	}
	for name, value := range map[string]string{"project-id": "linked-project", "environment-alias": "dev"} {
		if FlagChanged(cmd, name) {
			continue // what internal/link does: never touch an explicit flag
		}
		if err := SetLinkDefault(cmd, name, value); err != nil {
			t.Fatal(err)
		}
	}
	req, err := BuildRequest[linkedRequest](cmd, linkedMeta, "Body", "body")
	if err != nil {
		t.Fatalf("BuildRequest(%v): %v", args, err)
	}
	return req
}

func environment(req *linkedRequest) string {
	if req.Body.EnvironmentAlias == nil {
		return "<unset>"
	}
	return *req.Body.EnvironmentAlias
}

func TestLinkDefaultsFillWhatNothingElseSet(t *testing.T) {
	req := buildLinked(t, "")
	if req.ProjectID != "linked-project" || environment(req) != "dev" {
		t.Fatalf("got project %q, environment %q", req.ProjectID, environment(req))
	}
}

func TestBodyWinsOverTheLink(t *testing.T) {
	req := buildLinked(t, "", "--body", `{"environmentAlias":"production"}`)
	if environment(req) != "production" {
		t.Fatalf("a value in --body was replaced by the link: %q", environment(req))
	}
	if req.ProjectID != "linked-project" {
		t.Fatalf("a parameter the body does not carry still comes from the link: %q", req.ProjectID)
	}
}

func TestStdinWinsOverTheLink(t *testing.T) {
	req := buildLinked(t, `{"environmentAlias":"production"}`)
	if environment(req) != "production" {
		t.Fatalf("a value on stdin was replaced by the link: %q", environment(req))
	}
}

func TestLinkFillsABodyThatLeavesTheFieldOut(t *testing.T) {
	req := buildLinked(t, "", "--body", `{"sessionID":"s1"}`)
	if environment(req) != "dev" || req.Body.SessionID == nil || *req.Body.SessionID != "s1" {
		t.Fatalf("got environment %q, session %v", environment(req), req.Body.SessionID)
	}
}

func TestExplicitFlagWinsOverBodyAndLink(t *testing.T) {
	req := buildLinked(t, "", "--body", `{"environmentAlias":"production"}`, "--environment-alias", "staging", "--project-id", "explicit")
	if environment(req) != "staging" || req.ProjectID != "explicit" {
		t.Fatalf("got project %q, environment %q", req.ProjectID, environment(req))
	}
}

func TestFieldIsEmptyAllocatesNothing(t *testing.T) {
	var req linkedRequest
	if !fieldIsEmpty(reflect.ValueOf(&req).Elem(), "Body.EnvironmentAlias") {
		t.Fatal("an unset pointer field is empty")
	}
	if req.Body.EnvironmentAlias != nil {
		t.Fatal("checking a field must not allocate it")
	}
}
