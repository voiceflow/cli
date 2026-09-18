package oauth

import (
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"
)

// newLoginTestCmd builds a command carrying the same flags 'vf auth login'
// has: the root's persistent --token and --no-interactive plus the browser
// login flags.
func newLoginTestCmd() *cobra.Command {
	root := &cobra.Command{Use: "vf"}
	root.PersistentFlags().String("token", "", "Voiceflow bearer token")
	root.PersistentFlags().Bool("no-interactive", false, "Disable all interactive features")

	login := &cobra.Command{Use: "login", RunE: func(*cobra.Command, []string) error { return nil }}
	AddLoginFlags(login)
	root.AddCommand(login)
	return root
}

func TestShouldUseBrowserLogin(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want bool
	}{
		{"no flags", []string{"login"}, true},
		{"explicit token", []string{"login", "--token", "abc"}, false},
		{"manual prompt", []string{"login", "--manual"}, false},
		{"non-interactive", []string{"login", "--no-interactive"}, false},
		{"browser flags only", []string{"login", "--no-browser"}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := newLoginTestCmd()
			root.SetArgs(tc.args)
			root.SetOut(&strings.Builder{})
			root.SetErr(&strings.Builder{})

			executed, err := root.ExecuteC()
			if err != nil {
				t.Fatalf("execute %v: %v", tc.args, err)
			}
			if got := ShouldUseBrowserLogin(executed); got != tc.want {
				t.Errorf("ShouldUseBrowserLogin(%v) = %v, want %v", tc.args, got, tc.want)
			}
		})
	}
}

func TestShouldUseBrowserLoginWithoutTheFlagsRegistered(t *testing.T) {
	// The generated command must still work if the flags are ever missing.
	bare := &cobra.Command{Use: "login"}
	if !ShouldUseBrowserLogin(bare) {
		t.Error("ShouldUseBrowserLogin should default to the browser flow")
	}
}

func TestWriteStatusWithoutASession(t *testing.T) {
	useTestStore(t, true)

	out := &strings.Builder{}
	WriteStatus(out)

	if !strings.Contains(out.String(), "not signed in") {
		t.Errorf("status = %q, want it to report no session", out)
	}
}

func TestWriteStatusWithASession(t *testing.T) {
	useTestStore(t, true)
	if err := SaveSession(sampleSession()); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	out := &strings.Builder{}
	WriteStatus(out)

	rendered := out.String()
	for _, want := range []string{DefaultIssuer, "universal.workspace.read", "OS keychain"} {
		if !strings.Contains(rendered, want) {
			t.Errorf("status = %q, want it to mention %q", rendered, want)
		}
	}
	if strings.Contains(rendered, "access-token-value") {
		t.Errorf("status leaked token material:\n%s", rendered)
	}
}

func TestDescribeExpiry(t *testing.T) {
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)

	cases := []struct {
		name   string
		expiry time.Time
		want   string
	}{
		{"unknown", time.Time{}, "unknown"},
		{"expired", now.Add(-time.Hour), "expired"},
		{"an hour out", now.Add(time.Hour), "in 1h0m0s"},
		{"seconds out", now.Add(20 * time.Second), "in 20s"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := describeExpiry(tc.expiry, now); !strings.Contains(got, tc.want) {
				t.Errorf("describeExpiry(%v) = %q, want it to contain %q", tc.expiry, got, tc.want)
			}
		})
	}
}
