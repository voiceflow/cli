package cli

import (
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/voiceflow/cli/internal/output"
)

// A trimmed search_voiceflow response, SSE-framed the way the docs server
// sends it.
const docsSearchSSE = `event: message
data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Voiceflow — how_to · 1 result(s)"}],"structuredContent":{"intent":"how_to","results":[{"rank":1,"title":"Personal access tokens","trail":"APIs › Getting started › Personal access tokens › Create a token","url":"https://www.voiceflow.com/docs/api-reference/authentication#create-a-token","pageUrl":"https://www.voiceflow.com/docs/api-reference/authentication","snippet":"Open Settings → Access tokens.","why":"glossary","score":2.9}]}}}
`

func TestParseDocsSearchResponseReadsTheStructuredResults(t *testing.T) {
	for name, body := range map[string]string{
		"SSE-framed": docsSearchSSE,
		"plain JSON": strings.TrimPrefix(strings.SplitN(docsSearchSSE, "\n", 2)[1], "data: "),
	} {
		t.Run(name, func(t *testing.T) {
			results, err := parseDocsSearchResponse([]byte(body))
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			want := docsSearchResult{
				Title:   "Personal access tokens",
				Link:    "https://www.voiceflow.com/docs/api-reference/authentication#create-a-token",
				Page:    "api-reference/authentication",
				Content: "Open Settings → Access tokens.",
			}
			if len(results) != 1 || results[0] != want {
				t.Fatalf("results = %+v, want [%+v]", results, want)
			}
		})
	}
}

// The docs server reports a failed tool call inside a successful JSON-RPC
// result. vf used to print that failure as a search hit and exit 0.
func TestParseDocsSearchResponseFailsOnAToolError(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"no such tool: search_voiceflow_documentation"}],"isError":true}}`

	results, err := parseDocsSearchResponse([]byte(body))
	if err == nil {
		t.Fatalf("parse succeeded with %+v, want an error", results)
	}
	if !strings.Contains(err.Error(), "no such tool: search_voiceflow_documentation") {
		t.Errorf("error %q does not carry the server's reason", err)
	}
}

func TestParseDocsSearchResponseFailsWithoutResults(t *testing.T) {
	for name, body := range map[string]string{
		"JSON-RPC error":        `{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"invalid params"}}`,
		"no structured content": `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Title: old format"}]}}`,
		"not JSON":              "event: message\n",
	} {
		t.Run(name, func(t *testing.T) {
			if results, err := parseDocsSearchResponse([]byte(body)); err == nil {
				t.Fatalf("parse succeeded with %+v, want an error", results)
			}
		})
	}
}

func TestDocsPagePath(t *testing.T) {
	for pageURL, want := range map[string]string{
		"https://www.voiceflow.com/docs/api-reference/authentication":           "api-reference/authentication",
		"https://www.voiceflow.com/docs/cli/commands/environment/publish#usage": "cli/commands/environment/publish",
		"https://www.voiceflow.com/docs/cli/overview?ref=search":                "cli/overview",
		"https://example.com/docs/page":                                         "https://example.com/docs/page",
	} {
		if got := docsPagePath(pageURL); got != want {
			t.Errorf("docsPagePath(%q) = %q, want %q", pageURL, got, want)
		}
	}
}

func TestDocsSearchArgumentsNameWhoIsAsking(t *testing.T) {
	output.ResetAgentMode()
	t.Cleanup(output.ResetAgentMode)

	args := docsSearchArguments("personal access token")
	for _, field := range []string{"initiator", "purpose", "why", "question"} {
		if args[field] == "" {
			t.Errorf("argument %q is empty; the search tool requires it", field)
		}
	}
	if args["question"] != "personal access token" || args["initiator"] != "human" {
		t.Errorf("arguments = %v, want the query as question and initiator human", args)
	}

	t.Setenv("FORCE_AGENT_MODE", "1")
	output.InitAgentMode(&cobra.Command{Use: "vf"})
	if got := docsSearchArguments("x")["initiator"]; got != "agent" {
		t.Errorf("initiator in agent mode = %q, want agent", got)
	}
}
