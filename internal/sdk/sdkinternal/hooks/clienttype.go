package hooks

import "net/http"

type clientTypeHook struct{}

var _ beforeRequestHook = (*clientTypeHook)(nil)

func (h *clientTypeHook) BeforeRequest(_ BeforeRequestContext, req *http.Request) (*http.Request, error) {
	req.Header.Set("x-vf-client", "vf")
	req.Header.Set("x-vf-client-type", "cli")
	return req, nil
}
