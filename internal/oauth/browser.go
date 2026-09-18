package oauth

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// browserOpener is swapped out in tests.
var browserOpener = openBrowser

// openBrowser launches the platform's default browser on url. The URL is
// always passed as a separate argument, never interpolated into a shell
// command, so its query string cannot be reinterpreted by a shell.
func openBrowser(url string) error {
	var name string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		name, args = "open", []string{url}
	case "windows":
		// rundll32 hands the URL to the registered protocol handler without
		// going through cmd.exe, where '&' would split the command.
		name, args = "rundll32", []string{"url.dll,FileProtocolHandler", url}
	default:
		// xdg-open is the freedesktop standard; the others cover minimal
		// installs and WSL.
		for _, candidate := range []string{"xdg-open", "wslview", "gio", "sensible-browser", "x-www-browser"} {
			if path, err := exec.LookPath(candidate); err == nil {
				name = path
				if candidate == "gio" {
					args = []string{"open", url}
				} else {
					args = []string{url}
				}
				break
			}
		}
		if name == "" {
			return fmt.Errorf("no browser launcher found (tried xdg-open, wslview, gio)")
		}
	}

	cmd := exec.Command(name, args...)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("launch browser via %s: %w", strings.TrimSpace(name), err)
	}
	// The launcher exits immediately after handing the URL to the browser;
	// reap it so it does not linger as a zombie for the CLI's lifetime.
	go func() { _ = cmd.Wait() }()
	return nil
}
