package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/spf13/cobra"
)

// After signup, VF_TOKEN or --token may belong to a different account than
// the one just created, so the workspace lookup must use the new session's
// token instead of the usual credential precedence.
func TestListSignupWorkspacesUsesTheNewSessionToken(t *testing.T) {
	var mu sync.Mutex
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		gotAuth = r.Header.Get("Authorization")
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"workspaces": []map[string]any{{
			"id": "ws-1", "name": "My Workspace", "image": nil, "organizationID": "org-1",
			"createdAt": "2026-11-23T00:00:00Z", "updatedAt": "2026-11-23T00:00:00Z",
		}}})
	}))
	t.Cleanup(server.Close)

	cmd := &cobra.Command{Use: "signup"}
	cmd.Flags().String("server-url", "", "")
	cmd.Flags().String("token", "", "")
	if err := cmd.Flags().Set("server-url", server.URL); err != nil {
		t.Fatal(err)
	}
	// A --token flag outranks every other credential for ordinary commands.
	if err := cmd.Flags().Set("token", "someone-elses-token"); err != nil {
		t.Fatal(err)
	}

	workspaces, err := listSignupWorkspaces(context.Background(), cmd, "new-session-token")
	if err != nil {
		t.Fatalf("listSignupWorkspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].ID != "ws-1" || workspaces[0].Name != "My Workspace" {
		t.Errorf("workspaces = %+v, want the listed workspace", workspaces)
	}
	if gotAuth != "Bearer new-session-token" {
		t.Errorf("Authorization = %q, want the new session's token", gotAuth)
	}
}
