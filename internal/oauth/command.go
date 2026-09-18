package oauth

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/spf13/cobra"
	"github.com/voiceflow/cli/internal/config"
)

// Flag names added to 'vf auth login'.
const (
	flagManual       = "manual"
	flagNoBrowser    = "no-browser"
	flagScope        = "scope"
	flagLoginTimeout = "login-timeout"
)

// AddLoginFlags registers the browser-login flags on 'vf auth login'.
func AddLoginFlags(cmd *cobra.Command) {
	flags := cmd.Flags()
	flags.Bool(flagManual, false, "Prompt for a bearer token instead of signing in through the browser")
	flags.Bool(flagNoBrowser, false, "Print the sign-in URL instead of opening a browser")
	flags.StringArray(flagScope, nil, "OAuth scope to request (repeatable). Defaults to the scopes the authorization server advertises.")
	flags.Duration(flagLoginTimeout, DefaultLoginTimeout, "How long to wait for the browser to complete sign-in")

	for _, name := range []string{flagManual, flagNoBrowser, flagScope, flagLoginTimeout} {
		_ = flags.SetAnnotation(name, "speakeasy:group", []string{"Authentication"})
	}
}

// ShouldUseBrowserLogin reports whether 'vf auth login' should run the OAuth
// browser flow. Passing --token or --manual selects the token-entry path
// instead, and --no-interactive rules out both browser and prompt.
func ShouldUseBrowserLogin(cmd *cobra.Command) bool {
	if manual, err := cmd.Flags().GetBool(flagManual); err == nil && manual {
		return false
	}
	if noInteractive, err := cmd.Flags().GetBool("no-interactive"); err == nil && noInteractive {
		return false
	}
	if flag := cmd.Flags().Lookup("token"); flag != nil && flag.Changed {
		return false
	}
	return true
}

// RunLogin executes the browser login flow for 'vf auth login' and reports the
// resulting session. Progress goes to stderr, matching the rest of the auth
// commands, so piped output stays clean.
func RunLogin(cmd *cobra.Command) error {
	out := cmd.OutOrStderr()

	noBrowser, _ := cmd.Flags().GetBool(flagNoBrowser)
	scopes, _ := cmd.Flags().GetStringArray(flagScope)
	timeout, _ := cmd.Flags().GetDuration(flagLoginTimeout)

	session, err := Login(cmd.Context(), os.Getenv, LoginOptions{
		Scopes:    scopes,
		NoBrowser: noBrowser,
		Timeout:   timeout,
		Out:       out,
	})
	if err != nil {
		return err
	}

	fmt.Fprintf(out, "\nSigned in to %s\n", session.Issuer)
	if session.Scope != "" {
		fmt.Fprintf(out, "  %-9s %s\n", "scopes", session.Scope)
	}
	fmt.Fprintf(out, "  %-9s %s\n", "expires", describeExpiry(session.Expiry, time.Now()))
	fmt.Fprintf(out, "  %-9s %s\n", "storage", session.storageLocation())

	// A token from the environment outranks the session that was just stored,
	// so say so rather than letting the next command look like it ignored the login.
	if config.GetEnvValue("token") != "" {
		fmt.Fprintln(out, "\nNote: VF_TOKEN is set and takes precedence over this session. Unset it to use the OAuth session.")
	}
	return nil
}

// RunLogout clears the stored OAuth session and reports whether there was one.
func RunLogout() (bool, error) {
	status := CurrentStatus()
	if err := Logout(); err != nil {
		return false, err
	}
	return status.LoggedIn, nil
}

// WriteStatus prints the OAuth session block for 'vf auth whoami'.
func WriteStatus(w io.Writer) {
	status := CurrentStatus()

	fmt.Fprintln(w)
	fmt.Fprintln(w, "OAuth session:")
	if !status.LoggedIn {
		fmt.Fprintln(w, "  not signed in (run 'vf auth login')")
		return
	}

	fmt.Fprintf(w, "  %-9s %s\n", "issuer", status.Issuer)
	if status.Scope != "" {
		fmt.Fprintf(w, "  %-9s %s\n", "scopes", status.Scope)
	}
	fmt.Fprintf(w, "  %-9s %s\n", "expires", describeExpiry(status.Expiry, time.Now()))
	fmt.Fprintf(w, "  %-9s %s\n", "storage", status.Storage)
}

// describeExpiry renders an expiry as an absolute time plus how far away it
// is, or notes that the session is expired or has no stated lifetime.
func describeExpiry(expiry, now time.Time) string {
	if expiry.IsZero() {
		return "unknown (server did not state a lifetime)"
	}
	stamp := expiry.UTC().Format("2006-01-02 15:04 UTC")
	remaining := expiry.Sub(now)
	if remaining <= 0 {
		return fmt.Sprintf("%s (expired; refreshes on next command)", stamp)
	}
	precision := time.Minute
	if remaining < time.Minute {
		precision = time.Second
	}
	return fmt.Sprintf("%s (in %s)", stamp, remaining.Round(precision))
}
