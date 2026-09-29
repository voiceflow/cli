package link

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"
)

const testProjectID = "0123456789abcdef01234567"

func writeLink(t *testing.T, dir, body string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, DirName), 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, DirName, FileName)
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestParseProjectIDAcceptsAndNormalizesAnID(t *testing.T) {
	got, err := ParseProjectID("  0123456789ABCDEF01234567 ")
	if err != nil || got != testProjectID {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestParseProjectIDExplainsCreatorURLs(t *testing.T) {
	_, err := ParseProjectID("https://creator.voiceflow.com/project/" + testProjectID + "/canvas/abc")
	if err == nil || !strings.Contains(err.Error(), "version id") || !strings.Contains(err.Error(), "Settings") {
		t.Fatalf("want an explanation that names the version id and where to find the project id, got %v", err)
	}
}

func TestParseProjectIDRejectsOtherInput(t *testing.T) {
	for _, in := range []string{"", "abc", testProjectID + "0", "zz23456789abcdef01234567"} {
		if _, err := ParseProjectID(in); err == nil {
			t.Errorf("%q: want an error", in)
		}
	}
}

func TestSaveThenFindRoundTrips(t *testing.T) {
	dir := t.TempDir()
	want := Link{ProjectID: testProjectID, ProjectName: "Returns", WorkspaceID: "VzElNm0wjL", EnvironmentAlias: "dev", LinkedAt: time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)}

	path, err := Save(dir, want)
	if err != nil {
		t.Fatal(err)
	}
	if path != filepath.Join(dir, DirName, FileName) {
		t.Fatalf("saved to %s", path)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o644 {
		t.Fatalf("want a 0644 file, got %v %v", info.Mode(), err)
	}
	leftovers, _ := filepath.Glob(filepath.Join(dir, DirName, "*.tmp-*"))
	if len(leftovers) != 0 {
		t.Fatalf("temporary files left behind: %v", leftovers)
	}

	got, err := Find(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Link != want || got.Path != path {
		t.Fatalf("got %+v, want %+v at %s", got, want, path)
	}
}

func TestFindWalksUpAndTheNearestLinkWins(t *testing.T) {
	root := t.TempDir()
	writeLink(t, root, `{"projectID":"`+testProjectID+`"}`)
	deep := filepath.Join(root, "a", "b", "c")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}

	got, err := Find(deep)
	if err != nil || got == nil || got.ProjectID != testProjectID {
		t.Fatalf("want the root link from a subdirectory, got %+v %v", got, err)
	}

	nearer := filepath.Join(root, "a")
	writeLink(t, nearer, `{"projectID":"fedcba9876543210fedcba98"}`)
	got, err = Find(deep)
	if err != nil || got == nil || got.ProjectID != "fedcba9876543210fedcba98" {
		t.Fatalf("want the nearer link, got %+v %v", got, err)
	}
}

func TestFindWithoutALinkReturnsNil(t *testing.T) {
	got, err := Find(t.TempDir())
	if err != nil || got != nil {
		t.Fatalf("got %+v %v", got, err)
	}
}

func TestFindIgnoresAVoiceflowFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, DirName), []byte("not a directory"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Find(dir)
	if err != nil || got != nil {
		t.Fatalf("a .voiceflow file is not a link: got %+v %v", got, err)
	}
}

func TestReadDefaultsTheEnvironmentAndNormalizesTheID(t *testing.T) {
	path := writeLink(t, t.TempDir(), `{"projectID":"0123456789ABCDEF01234567"}`)
	l, err := Read(path)
	if err != nil {
		t.Fatal(err)
	}
	if l.ProjectID != testProjectID || l.EnvironmentAlias != DefaultEnvironmentAlias {
		t.Fatalf("got %+v", l)
	}
}

func TestReadRejectsDamagedLinks(t *testing.T) {
	for name, body := range map[string]string{
		"not json":      `{"projectID":`,
		"no project id": `{"environmentAlias":"main"}`,
		"bad project":   `{"projectID":"nope"}`,
	} {
		path := writeLink(t, t.TempDir(), body)
		if _, err := Read(path); err == nil || !strings.Contains(err.Error(), path) {
			t.Errorf("%s: want an error naming %s, got %v", name, path, err)
		}
	}
}

func TestRemoveDeletesTheFileAndAnEmptyDirectory(t *testing.T) {
	dir := t.TempDir()
	path := writeLink(t, dir, `{"projectID":"`+testProjectID+`"}`)
	if err := Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, DirName)); !os.IsNotExist(err) {
		t.Fatalf("want .voiceflow gone, got %v", err)
	}
}

func TestRemoveKeepsADirectoryWithOtherFiles(t *testing.T) {
	dir := t.TempDir()
	path := writeLink(t, dir, `{"projectID":"`+testProjectID+`"}`)
	other := filepath.Join(dir, DirName, "notes.md")
	if err := os.WriteFile(other, []byte("keep me"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(other); err != nil {
		t.Fatalf("other files must survive: %v", err)
	}
}

// commandTree builds `vf <group> <name>` with the flags generated commands use.
func commandTree(group, name string, flags ...string) *cobra.Command {
	root := &cobra.Command{Use: "vf"}
	parent := &cobra.Command{Use: group}
	cmd := &cobra.Command{Use: name}
	for _, f := range flags {
		cmd.Flags().String(f, "", "")
	}
	root.AddCommand(parent)
	parent.AddCommand(cmd)
	return cmd
}

func linkedDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	writeLink(t, dir, `{"projectID":"`+testProjectID+`","workspaceID":"VzElNm0wjL","environmentAlias":"dev"}`)
	return dir
}

func flagValue(t *testing.T, cmd *cobra.Command, name string) (string, bool) {
	t.Helper()
	f := cmd.Flags().Lookup(name)
	return f.Value.String(), f.Changed
}

func TestApplyDefaultsFillsFlagsTheCommandHas(t *testing.T) {
	cmd := commandTree("playbook", "list", projectIDFlag, environmentAliasFlag)

	found, err := ApplyDefaults(cmd, linkedDir(t))
	if err != nil || found == nil {
		t.Fatalf("got %+v %v", found, err)
	}
	if v, changed := flagValue(t, cmd, projectIDFlag); v != testProjectID || !changed {
		t.Errorf("project-id = %q (changed %v)", v, changed)
	}
	if v, changed := flagValue(t, cmd, environmentAliasFlag); v != "dev" || !changed {
		t.Errorf("environment-alias = %q (changed %v)", v, changed)
	}
}

func TestApplyDefaultsNeverOverridesAnExplicitFlag(t *testing.T) {
	cmd := commandTree("playbook", "list", projectIDFlag, environmentAliasFlag)
	if err := cmd.Flags().Parse([]string{"--project-id", "fedcba9876543210fedcba98"}); err != nil {
		t.Fatal(err)
	}

	if _, err := ApplyDefaults(cmd, linkedDir(t)); err != nil {
		t.Fatal(err)
	}
	if v, _ := flagValue(t, cmd, projectIDFlag); v != "fedcba9876543210fedcba98" {
		t.Errorf("explicit project-id overridden: %q", v)
	}
	if v, _ := flagValue(t, cmd, environmentAliasFlag); v != "dev" {
		t.Errorf("unset environment-alias should still come from the link: %q", v)
	}
}

func TestApplyDefaultsNeverFillsWhatADeleteDestroys(t *testing.T) {
	cases := []struct{ group, keep string }{
		{"project", projectIDFlag},
		{"environment", environmentAliasFlag},
		{"workspace", workspaceIDFlag},
	}
	for _, c := range cases {
		cmd := commandTree(c.group, "delete", projectIDFlag, environmentAliasFlag, workspaceIDFlag)
		if _, err := ApplyDefaults(cmd, linkedDir(t)); err != nil {
			t.Fatal(err)
		}
		if _, changed := flagValue(t, cmd, c.keep); changed {
			t.Errorf("%s delete: --%s must be named explicitly", c.group, c.keep)
		}
	}

	// Deleting something inside the project still gets the project filled in.
	cmd := commandTree("playbook", "delete", projectIDFlag, environmentAliasFlag)
	if _, err := ApplyDefaults(cmd, linkedDir(t)); err != nil {
		t.Fatal(err)
	}
	if v, _ := flagValue(t, cmd, projectIDFlag); v != testProjectID {
		t.Errorf("playbook delete should use the linked project, got %q", v)
	}
}

func TestApplyDefaultsSkipsAnnotatedCommands(t *testing.T) {
	cmd := commandTree("link", "link", environmentAliasFlag)
	cmd.Annotations = map[string]string{SkipDefaultsAnnotation: "true"}
	found, err := ApplyDefaults(cmd, linkedDir(t))
	if err != nil || found != nil {
		t.Fatalf("got %+v %v", found, err)
	}
	if _, changed := flagValue(t, cmd, environmentAliasFlag); changed {
		t.Error("annotated command received a default")
	}
}

func TestApplyDefaultsDoesNotReadTheLinkForCommandsWithoutProjectFlags(t *testing.T) {
	dir := t.TempDir()
	writeLink(t, dir, `{broken`)
	cmd := commandTree("docs", "search")
	if found, err := ApplyDefaults(cmd, dir); err != nil || found != nil {
		t.Fatalf("a damaged link must not break unrelated commands: %+v %v", found, err)
	}
}

func TestApplyDefaultsReportsADamagedLinkWhenItIsNeeded(t *testing.T) {
	dir := t.TempDir()
	path := writeLink(t, dir, `{broken`)
	cmd := commandTree("playbook", "list", projectIDFlag)
	if _, err := ApplyDefaults(cmd, dir); err == nil || !strings.Contains(err.Error(), path) {
		t.Fatalf("want an error naming %s, got %v", path, err)
	}
}
