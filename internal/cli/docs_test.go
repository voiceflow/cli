package cli

import (
	"bytes"
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

// The response is the message that carries a result. An SSE stream may send
// other messages first, and may split one message across data: lines.
func TestParseDocsSearchResponseFindsTheResultInAStream(t *testing.T) {
	result := strings.TrimPrefix(strings.SplitN(docsSearchSSE, "\n", 2)[1], "data: ")
	cut := strings.Index(result, `,"structuredContent"`)
	for name, body := range map[string]string{
		"after a progress notification": "event: message\n" +
			`data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}` + "\n\n" +
			docsSearchSSE,
		"split across data lines": "event: message\r\ndata: " + result[:cut] + "\r\ndata: " + result[cut:] + "\r\n\r\n",
	} {
		t.Run(name, func(t *testing.T) {
			results, err := parseDocsSearchResponse([]byte(body))
			if err != nil || len(results) != 1 || results[0].Page != "api-reference/authentication" {
				t.Fatalf("results = %+v, err = %v; want the one hit", results, err)
			}
		})
	}
}

func TestParseDocsSearchResponseFailsOnAStreamWithNoReply(t *testing.T) {
	body := "event: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\n\n"
	if results, err := parseDocsSearchResponse([]byte(body)); err == nil {
		t.Fatalf("parse succeeded with %+v, want an error", results)
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

func TestParseDocsSearchResponseNamesAReasonForAToolErrorWithoutText(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":1,"result":{"content":[],"isError":true}}`

	_, err := parseDocsSearchResponse([]byte(body))
	if err == nil || !strings.Contains(err.Error(), "without saying why") {
		t.Fatalf("err = %v, want one that says the tool gave no reason", err)
	}
}

func TestParseDocsSearchResponseTakesThePageFromTheLinkWhenThereIsNoPageURL(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"results":[` +
		`{"title":"Personal access tokens","url":"https://www.voiceflow.com/docs/api-reference/authentication#create-a-token","snippet":"s"}]}}}`

	results, err := parseDocsSearchResponse([]byte(body))
	if err != nil || len(results) != 1 || results[0].Page != "api-reference/authentication" {
		t.Fatalf("results = %+v, err = %v; want the page taken from the link", results, err)
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

// writeJSON runs writeDocsSearchJSON with --jq set to expression, or unset
// when it is empty, and returns what it printed.
func writeJSON(t *testing.T, results []docsSearchResult, expression string) string {
	t.Helper()
	var stdout bytes.Buffer
	cmd := &cobra.Command{Use: "search"}
	cmd.Flags().String("jq", "", "")
	if expression != "" {
		if err := cmd.Flags().Set("jq", expression); err != nil {
			t.Fatal(err)
		}
	}
	cmd.SetOut(&stdout)
	if err := writeDocsSearchJSON(cmd, results); err != nil {
		t.Fatalf("writeDocsSearchJSON: %v", err)
	}
	return stdout.String()
}

func TestDocsSearchJSONPrintsAnEmptyListForNoMatches(t *testing.T) {
	if got := writeJSON(t, []docsSearchResult{}, ""); strings.TrimSpace(got) != "[]" {
		t.Fatalf("printed %q, want []", got)
	}
}

func TestDocsSearchJSONAppliesJq(t *testing.T) {
	results := []docsSearchResult{{Title: "Personal access tokens", Page: "api-reference/authentication"}}

	if got := writeJSON(t, results, ".[0].page"); strings.TrimSpace(got) != `"api-reference/authentication"` {
		t.Fatalf("printed %q, want only the page", got)
	}
	if got := writeJSON(t, results, ""); !strings.Contains(got, `"title": "Personal access tokens"`) {
		t.Fatalf("printed %q, want the whole list", got)
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
