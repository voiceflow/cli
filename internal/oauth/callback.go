package oauth

import (
	"context"
	"crypto/subtle"
	"fmt"
	"html"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// callbackResult carries the outcome of the authorization redirect back to the
// login flow.
type callbackResult struct {
	code string
	err  error
}

// callbackServer is the loopback redirect receiver required by RFC 8252 for
// native apps: a short-lived HTTP server on 127.0.0.1 that the browser is
// redirected to with the authorization code.
type callbackServer struct {
	listener    net.Listener
	server      *http.Server
	results     chan callbackResult
	redirectURI string
	state       string
	once        sync.Once

	// page is the server's own page for how the login went, if it has one.
	page atomic.Pointer[resultPage]
	// done is closed once the login has ended, after outcome is set.
	done    chan struct{}
	outcome loginOutcome
	ended   sync.Once
}

// startCallbackServer binds the first available address in candidates (each a
// "host:port" the client is registered to redirect to) and serves path until
// the authorization code arrives.
func startCallbackServer(candidates []redirectTarget, state string) (*callbackServer, error) {
	var listener net.Listener
	var target redirectTarget
	var lastErr error

	for _, candidate := range candidates {
		ln, err := net.Listen("tcp", candidate.address())
		if err != nil {
			lastErr = err
			continue
		}
		listener, target = ln, candidate
		if addr, ok := ln.Addr().(*net.TCPAddr); ok {
			// Port 0 means "any free port"; record the one actually bound so
			// the redirect URI matches where the server is listening.
			target.Port = addr.Port
		}
		break
	}
	if listener == nil {
		return nil, fmt.Errorf("no registered callback port is available: %w", lastErr)
	}

	cb := &callbackServer{
		listener:    listener,
		results:     make(chan callbackResult, 1),
		redirectURI: target.uri(),
		state:       state,
		done:        make(chan struct{}),
	}

	mux := http.NewServeMux()
	mux.HandleFunc(target.Path, cb.handle)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})

	cb.server = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		// Serve returns ErrServerClosed on shutdown; any other error surfaces
		// through Wait as a closed connection to the browser.
		_ = cb.server.Serve(listener)
	}()

	return cb, nil
}

// RedirectURI returns the URI the browser will be redirected to.
func (c *callbackServer) RedirectURI() string { return c.redirectURI }

func (c *callbackServer) handle(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	// State is checked before anything else, including an error response: the
	// loopback ports are predictable, so a stale or unsolicited request could
	// otherwise win the race and abort a login that is still in flight. A
	// mismatch is answered but never delivered, leaving the real callback free
	// to arrive. The comparison is constant-time so the state value cannot
	// leak through response timing.
	gotState := query.Get("state")
	if subtle.ConstantTimeCompare([]byte(gotState), []byte(c.state)) != 1 {
		c.writePage(w, http.StatusBadRequest, "Login failed", "The login response did not match this session. Start over with 'vf auth login'.")
		return
	}

	if errCode := query.Get("error"); errCode != "" {
		description := query.Get("error_description")
		message := errCode
		if description != "" {
			message = fmt.Sprintf("%s: %s", errCode, description)
		}
		outcome := loginOutcome{result: resultFailed, reason: reasonRefused}
		if errCode == "access_denied" {
			outcome = loginOutcome{result: resultDenied}
		}
		c.answer(w, r, outcome, http.StatusOK, "Login failed", message)
		c.deliver(callbackResult{err: fmt.Errorf("authorization denied (%s)", message)})
		return
	}

	code := query.Get("code")
	if code == "" {
		c.answer(w, r, loginOutcome{result: resultFailed, reason: reasonRefused}, http.StatusBadRequest, "Login failed", "The login response contained no authorization code.")
		c.deliver(callbackResult{err: fmt.Errorf("authorization response contained no code")})
		return
	}

	c.deliver(callbackResult{code: code})

	// Nobody is signed in until the code is exchanged and the session stored,
	// so the browser is not told before.
	select {
	case <-c.done:
	case <-r.Context().Done():
		return
	}
	if c.outcome.result == resultAuthorized {
		c.answer(w, r, c.outcome, http.StatusOK, "Signed in", "You can close this tab and return to your terminal.")
	} else {
		c.answer(w, r, c.outcome, http.StatusOK, "Login failed", "Return to your terminal to see why.")
	}
}

// ShowResultOn has the browser sent to page, when there is one, instead of
// being shown one from here.
func (c *callbackServer) ShowResultOn(page *resultPage) { c.page.Store(page) }

// Finish ends the login for the browser, which waits to be told how it went.
// Only the first call counts.
func (c *callbackServer) Finish(outcome loginOutcome) {
	c.ended.Do(func() {
		c.outcome = outcome
		close(c.done)
	})
}

// answer tells the browser how the login went: on the server's own page, or
// else with the heading and message here.
func (c *callbackServer) answer(w http.ResponseWriter, r *http.Request, outcome loginOutcome, status int, heading, message string) {
	location := c.page.Load().address(outcome)
	if location == "" {
		c.writePage(w, status, heading, message)
		return
	}
	// This address holds the authorization code.
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, location, http.StatusFound)
}

// deliver sends the first result and ignores any later ones, so a reloaded
// browser tab cannot overwrite a successful outcome.
func (c *callbackServer) deliver(result callbackResult) {
	c.once.Do(func() { c.results <- result })
}

// Wait blocks until the browser completes the redirect, the context is
// cancelled, or the deadline passes.
func (c *callbackServer) Wait(ctx context.Context) (string, error) {
	select {
	case result := <-c.results:
		return result.code, result.err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

// Close shuts the server down, allowing in-flight responses a moment to reach
// the browser. One still waiting for the login to end is told that it failed.
func (c *callbackServer) Close() {
	c.Finish(loginOutcome{result: resultFailed})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = c.server.Shutdown(ctx)
}

func (c *callbackServer) writePage(w http.ResponseWriter, status int, heading, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	// The message can include an error_description from the authorization
	// server, so escape everything before it reaches the page.
	fmt.Fprintf(w, callbackPageTemplate, html.EscapeString(heading), html.EscapeString(heading), html.EscapeString(message))
}

// callbackPageTemplate takes the page title, heading, and message, each of
// which must be HTML-escaped by the caller.
const callbackPageTemplate = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>%s &middot; Voiceflow CLI</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; margin: 0; background: Canvas; color: CanvasText;
  }
  main { text-align: center; padding: 2rem; max-width: 26rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { margin: 0; opacity: 0.75; line-height: 1.5; }
</style>
</head>
<body><main><h1>%s</h1><p>%s</p></main></body>
</html>
`
