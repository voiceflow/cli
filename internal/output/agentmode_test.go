package output

import (
	"testing"

	"github.com/spf13/cobra"
)

// commandTree returns a root with the global --agent-mode flag and a child,
// the two commands Execute and PersistentPreRunE pass to InitAgentMode.
func commandTree() (root, child *cobra.Command) {
	root = &cobra.Command{Use: "vf"}
	root.PersistentFlags().Bool("agent-mode", false, "")
	child = &cobra.Command{Use: "workspace", Run: func(*cobra.Command, []string) {}}
	root.AddCommand(child)
	return root, child
}

// Execute calls InitAgentMode before cobra parses flags, so it sees only the
// environment; PersistentPreRunE calls it again once flags are parsed. An
// explicit --agent-mode must win on that second call, in both directions.
func TestAnExplicitAgentModeFlagWinsOverTheEnvironment(t *testing.T) {
	cases := []struct {
		name      string
		underAnAI bool
		flag      string
		want      bool
	}{
		{"--agent-mode=false under an agent", true, "false", false},
		{"--agent-mode outside an agent", false, "true", true},
		{"no flag under an agent", true, "", true},
		{"no flag outside an agent", false, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, name := range agentEnvVars {
				t.Setenv(name, "")
			}
			if tc.underAnAI {
				t.Setenv("CLAUDECODE", "1")
			}
			ResetAgentMode()
			t.Cleanup(ResetAgentMode)
			root, child := commandTree()

			InitAgentMode(root) // as Execute does, before flags are parsed
			if tc.flag != "" {
				if err := root.PersistentFlags().Set("agent-mode", tc.flag); err != nil {
					t.Fatal(err)
				}
			}
			InitAgentMode(child) // as PersistentPreRunE does, after parsing

			if got := IsAgentMode(); got != tc.want {
				t.Errorf("IsAgentMode() = %v, want %v", got, tc.want)
			}
		})
	}
}
