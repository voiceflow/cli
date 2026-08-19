package hooks

import (
	"net/http"
)

// clientTypeHook adds the x-vf-client-type header to every outgoing request so
// the API can attribute traffic to the CLI.
type clientTypeHook struct{}

var _ beforeRequestHook = (*clientTypeHook)(nil)

func (h *clientTypeHook) BeforeRequest(_ BeforeRequestContext, req *http.Request) (*http.Request, error) {
	req.Header.Set("x-vf-client", "vf")
	req.Header.Set("x-vf-client-type", "cli")
	return req, nil
}
