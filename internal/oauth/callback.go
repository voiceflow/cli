package oauth

import (
	"context"
	"crypto/subtle"
	"fmt"
	"html"
	"net"
	"net/http"
	"sync"
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
		c.writePage(w, http.StatusOK, "Login failed", message)
		c.deliver(callbackResult{err: fmt.Errorf("authorization denied (%s)", message)})
		return
	}

	code := query.Get("code")
	if code == "" {
		c.writePage(w, http.StatusBadRequest, "Login failed", "The login response contained no authorization code.")
		c.deliver(callbackResult{err: fmt.Errorf("authorization response contained no code")})
		return
	}

	c.writePage(w, http.StatusOK, "Signed in", "You can close this tab and return to your terminal.")
	c.deliver(callbackResult{code: code})
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
// the browser.
func (c *callbackServer) Close() {
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
