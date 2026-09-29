// Package link pins a Voiceflow project and environment to a directory, so
// vf commands run inside it need no --project-id or --environment-alias.
//
// A link is a small JSON file, .voiceflow/project.json, found by walking up
// from the working directory the way git finds .git. Nothing in it is secret:
// two ids, a name, an environment alias and a timestamp.
package link

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/voiceflow/cli/internal/flagutil"
)

const (
	// DirName and FileName locate a link: <dir>/.voiceflow/project.json.
	DirName  = ".voiceflow"
	FileName = "project.json"

	// DefaultEnvironmentAlias is the environment every project starts with.
	DefaultEnvironmentAlias = "main"

	// SkipDefaultsAnnotation marks a command that must not receive linked
	// defaults: `vf link` itself, which decides them.
	SkipDefaultsAnnotation = "vf.link.skip-defaults"
)

// Link is the pinned project, as stored in .voiceflow/project.json.
type Link struct {
	ProjectID        string    `json:"projectID"`
	ProjectName      string    `json:"projectName,omitempty"`
	WorkspaceID      string    `json:"workspaceID,omitempty"`
	EnvironmentAlias string    `json:"environmentAlias"`
	LinkedAt         time.Time `json:"linkedAt"`
}

// Found is a link together with the file it was read from.
type Found struct {
	Link
	Path string `json:"-"`
}

// Voiceflow project ids are 24-character hex object ids.
var projectIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{24}$`)

// ParseProjectID validates a project id and normalizes it to lower case.
//
// A Creator URL is refused with an explanation rather than parsed: the id in
// /project/<id>/ is a version id, and the public API cannot look up the
// project a version belongs to.
func ParseProjectID(ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	if projectIDPattern.MatchString(ref) {
		return strings.ToLower(ref), nil
	}
	if strings.Contains(ref, "://") || strings.Contains(ref, "voiceflow.com/") {
		return "", errors.New("that is a Creator URL, and the id in it is a version id, not a project id. " +
			"Copy the Project ID from the agent's Settings → General (Metadata) in Creator")
	}
	return "", fmt.Errorf("%q is not a project id: expected 24 hexadecimal characters", ref)
}

// Locate returns the path of the nearest link file at or above dir, or ""
// when there is none. It does not read the file, so a link that fails to
// parse can still be found and removed.
func Locate(dir string) (string, error) {
	dir, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	for {
		path := filepath.Join(dir, DirName, FileName)
		info, err := os.Stat(path)
		switch {
		case err == nil && !info.IsDir():
			return path, nil
		// A missing file, or a .voiceflow that is a file rather than a
		// directory, just means no link at this level.
		case err == nil, errors.Is(err, fs.ErrNotExist), errors.Is(err, syscall.ENOTDIR):
		default:
			return "", fmt.Errorf("check %s: %w", path, err)
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", nil
		}
		dir = parent
	}
}

// Find returns the nearest link at or above dir, or nil when there is none.
func Find(dir string) (*Found, error) {
	path, err := Locate(dir)
	if err != nil || path == "" {
		return nil, err
	}
	l, err := Read(path)
	if err != nil {
		return nil, err
	}
	return &Found{Link: *l, Path: path}, nil
}

// Read parses one link file.
func Read(path string) (*Link, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var l Link
	if err := json.Unmarshal(data, &l); err != nil {
		return nil, fmt.Errorf("%s is not a valid link: %w", path, err)
	}
	if !projectIDPattern.MatchString(l.ProjectID) {
		return nil, fmt.Errorf("%s is not a valid link: projectID %q is not a project id", path, l.ProjectID)
	}
	l.ProjectID = strings.ToLower(l.ProjectID)
	// A hand-written link may name only the project; every project has main.
	if l.EnvironmentAlias == "" {
		l.EnvironmentAlias = DefaultEnvironmentAlias
	}
	return &l, nil
}

// Save writes l to dir/.voiceflow/project.json and returns the file's path.
// The write goes through a temporary file and a rename, so an interrupted
// save never leaves half a link behind.
func Save(dir string, l Link) (string, error) {
	linkDir := filepath.Join(dir, DirName)
	if err := os.MkdirAll(linkDir, 0o755); err != nil {
		return "", fmt.Errorf("create %s: %w", linkDir, err)
	}
	data, err := json.MarshalIndent(l, "", "  ")
	if err != nil {
		return "", err
	}
	data = append(data, '\n')

	tmp, err := os.CreateTemp(linkDir, FileName+".tmp-*")
	if err != nil {
		return "", fmt.Errorf("write link: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath) // no-op after a successful rename

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return "", fmt.Errorf("write link: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("write link: %w", err)
	}
	// Not a secret: readable like any other project file.
	if err := os.Chmod(tmpPath, 0o644); err != nil {
		return "", fmt.Errorf("write link: %w", err)
	}
	path := filepath.Join(linkDir, FileName)
	if err := os.Rename(tmpPath, path); err != nil {
		return "", fmt.Errorf("write link: %w", err)
	}
	return path, nil
}

// Remove deletes a link file, and its .voiceflow directory when nothing else
// lives there.
func Remove(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove %s: %w", path, err)
	}
	// Fails harmlessly when the directory still holds other files.
	_ = os.Remove(filepath.Dir(path))
	return nil
}

// The flags a link can fill.
const (
	projectIDFlag        = "project-id"
	environmentAliasFlag = "environment-alias"
	workspaceIDFlag      = "workspace-id"
)

func (l Link) valueFor(flag string) string {
	switch flag {
	case projectIDFlag:
		return l.ProjectID
	case environmentAliasFlag:
		return l.EnvironmentAlias
	case workspaceIDFlag:
		return l.WorkspaceID
	}
	return ""
}

// deleteTargets maps a command group to the flag that names what its delete
// command destroys. A link never fills that flag: deleting a project, an
// environment or a workspace always names the target explicitly.
var deleteTargets = map[string]string{
	"project":     projectIDFlag,
	"environment": environmentAliasFlag,
	"workspace":   workspaceIDFlag,
}

func isDeleteTarget(cmd *cobra.Command, flag string) bool {
	if cmd.Name() != "delete" || !cmd.HasParent() {
		return false
	}
	return deleteTargets[cmd.Parent().Name()] == flag
}

// ApplyDefaults fills the project, environment and workspace flags that cmd
// has but was not given, from the nearest link at or above dir. It returns
// the link it used, or nil when none applied.
//
// A linked value is a fallback, never an override: an explicit flag wins,
// and so does a value in --body or stdin. The flags are not marked as set;
// see flagutil.SetLinkDefault.
//
// The link file is only read when the command can use it, so commands that
// take no project (auth, docs, version) never fail on a damaged link.
func ApplyDefaults(cmd *cobra.Command, dir string) (*Found, error) {
	if cmd.Annotations[SkipDefaultsAnnotation] == "true" {
		return nil, nil
	}
	var wanted []string
	for _, name := range []string{projectIDFlag, environmentAliasFlag, workspaceIDFlag} {
		f := cmd.Flags().Lookup(name)
		if f == nil || f.Changed || isDeleteTarget(cmd, name) {
			continue
		}
		wanted = append(wanted, name)
	}
	if len(wanted) == 0 {
		return nil, nil
	}

	found, err := Find(dir)
	if err != nil || found == nil {
		return nil, err
	}
	for _, name := range wanted {
		value := found.valueFor(name)
		if value == "" {
			continue
		}
		if err := flagutil.SetLinkDefault(cmd, name, value); err != nil {
			return nil, fmt.Errorf("apply --%s from %s: %w", name, found.Path, err)
		}
	}
	return found, nil
}
