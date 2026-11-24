package oauth

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/spf13/cobra"
	"github.com/voiceflow/cli/internal/config"
	"github.com/voiceflow/cli/internal/output"
)

// Flag names added to 'vf auth login'.
const (
	flagManual       = "manual"
	flagNoBrowser    = "no-browser"
	flagScope        = "scope"
	flagLoginTimeout = "login-timeout"
	flagSignup       = "signup"
	flagEmail        = "email"
)

// AddLoginFlags registers the browser-login flags on 'vf auth login'.
func AddLoginFlags(cmd *cobra.Command) {
	flags := cmd.Flags()
	flags.Bool(flagManual, false, "Prompt for a bearer token instead of signing in through the browser")
	flags.Bool(flagNoBrowser, false, "Print the sign-in URL instead of opening a browser (always on in agent mode)")
	flags.StringArray(flagScope, nil, "OAuth scope to request (repeatable). Defaults to the scopes the authorization server advertises.")
	flags.Duration(flagLoginTimeout, DefaultLoginTimeout, "How long to wait for the browser to complete sign-in (15m with --signup)")
	flags.Bool(flagSignup, false, "Create a new account in the browser instead of signing in (same as 'vf auth signup')")
	flags.String(flagEmail, "", "Email address to prefill on the signup form (with --signup)")

	for _, name := range []string{flagManual, flagNoBrowser, flagScope, flagLoginTimeout, flagSignup, flagEmail} {
		_ = flags.SetAnnotation(name, "speakeasy:group", []string{"Authentication"})
	}
}

// ShouldUseBrowserLogin reports whether 'vf auth login' should run the OAuth
// browser flow. Passing --token or --manual selects the token-entry path
// instead, and --no-interactive rules out both browser and prompt. --signup
// always takes the browser flow, which rejects those flags rather than
// silently storing a token instead of creating an account. So does --email,
// for the same reason.
func ShouldUseBrowserLogin(cmd *cobra.Command) bool {
	if signup, err := cmd.Flags().GetBool(flagSignup); err == nil && signup {
		return true
	}
	// --email only means something for signup; RunLogin rejects it without
	// --signup, so it must not slip through the token-entry path unnoticed.
	if email, err := cmd.Flags().GetString(flagEmail); err == nil && email != "" {
		return true
	}
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
// commands, so piped output stays clean. With --signup it runs signup instead.
func RunLogin(cmd *cobra.Command) error {
	signup, _ := cmd.Flags().GetBool(flagSignup)
	if email, _ := cmd.Flags().GetString(flagEmail); email != "" && !signup {
		return fmt.Errorf("--%s is only used with --%s", flagEmail, flagSignup)
	}
	return runBrowserLogin(cmd, signup)
}

// runBrowserLogin runs login, or signup when signup is set, for either
// 'vf auth login' or 'vf auth signup'.
func runBrowserLogin(cmd *cobra.Command, signup bool) error {
	if signup {
		if err := checkSignupFlags(cmd); err != nil {
			return err
		}
	}

	// Agent mode reports the same flow as JSON events, starting with the
	// authorization URL the agent hands to the user; see agent.go.
	if output.IsAgentMode() {
		return runAgentLogin(cmd, signup)
	}

	out := cmd.OutOrStderr()

	opts := loginOptionsFromFlags(cmd, signup)
	opts.Out = out
	// Login drops prompt=create when the server does not support it, so the
	// URL records whether this really was a signup.
	signupRequested := false
	opts.observeAuthURL = func(authURL string) { signupRequested = isSignupURL(authURL) }

	session, err := Login(cmd.Context(), os.Getenv, opts)
	if err != nil {
		return err
	}

	fmt.Fprintf(out, "\nSigned in to %s\n", session.Issuer)
	if signupRequested {
		if account := accountFromToken(session.AccessToken); account != "" {
			fmt.Fprintf(out, "  %-9s %s\n", "account", account)
		}
	}
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

	if signupRequested {
		workspaces, err := waitForWorkspaces(cmd.Context(), cmd, session.AccessToken)
		writeSignupResult(out, workspaces, err)
	}
	return nil
}

// loginOptionsFromFlags reads the browser-login flags shared by 'vf auth
// login' and 'vf auth signup'. The timeout is always resolved, so callers can
// report it.
func loginOptionsFromFlags(cmd *cobra.Command, signup bool) LoginOptions {
	noBrowser, _ := cmd.Flags().GetBool(flagNoBrowser)
	scopes, _ := cmd.Flags().GetStringArray(flagScope)
	timeout, _ := cmd.Flags().GetDuration(flagLoginTimeout)
	if signup && !cmd.Flags().Changed(flagLoginTimeout) {
		// 'vf auth login --signup' keeps login's 5-minute default otherwise,
		// which is too short for signup plus an email code.
		timeout = DefaultSignupTimeout
	}
	if timeout <= 0 {
		timeout = DefaultLoginTimeout
	}

	opts := LoginOptions{
		Scopes:    scopes,
		NoBrowser: noBrowser,
		Timeout:   timeout,
	}
	if signup {
		opts.Prompt = PromptCreate
		opts.LoginHint, _ = cmd.Flags().GetString(flagEmail)
	}
	return opts
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
		fmt.Fprintln(w, "  not signed in (run 'vf auth login', or 'vf auth signup' to create an account)")
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
