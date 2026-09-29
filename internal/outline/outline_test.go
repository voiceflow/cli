package outline

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/alpkeskin/gotoon"

	"github.com/voiceflow/cli/internal/sdk/models/components"
)

// SizeBudget is the most `vf context` may print in TOON, agent mode's
// default, for any project: roughly 5,000 tokens. The worst-case test below
// holds the outline to it.
const SizeBudget = 20 * 1024

var base = time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)

func at(minutesAgo int) time.Time { return base.Add(-time.Duration(minutesAgo) * time.Minute) }

func ptr[T any](v T) *T { return &v }

func decode[T any](t *testing.T, raw string) T {
	t.Helper()
	var v T
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		t.Fatalf("decode %T: %v\n%s", v, err, raw)
	}
	return v
}

func functionTool(t *testing.T, id, functionID string, updated time.Time) components.StableToolV2 {
	return decode[components.StableToolV2](t, fmt.Sprintf(`{
		"type": "function", "id": %q, "functionID": %q, "description": "",
		"createdAt": %q, "updatedAt": %q, "asyncExecution": false,
		"inputVariables": {}, "captureResponse": {}, "captureInputVariables": {}, "messages": null
	}`, id, functionID, at(10000).Format(time.RFC3339), updated.Format(time.RFC3339)))
}

func apiTool(t *testing.T, id string, updated time.Time) components.StableToolV2 {
	return decode[components.StableToolV2](t, fmt.Sprintf(`{
		"type": "api", "id": %q, "apiToolID": "a1", "description": "Look up an order",
		"createdAt": %q, "updatedAt": %q, "asyncExecution": false,
		"inputVariables": {}, "captureResponse": {}, "captureInputVariables": {}, "messages": null
	}`, id, at(10000).Format(time.RFC3339), updated.Format(time.RFC3339)))
}

func document(t *testing.T, id, kind, name string) components.StableDocument {
	data := decode[components.StableDocumentData](t, fmt.Sprintf(`{"type": %q, "name": %q, "url": "https://example.com/%s"}`, kind, name, id))
	return components.StableDocument{ID: id, Data: &data}
}

func sampleInputs(t *testing.T) Inputs {
	var instructions = "Route billing questions to Billing.\n\n\tEverything else goes to Support."
	var agentInstructions = func() (o components.StableAgentReadV2) {
		o.Instructions.Set(&instructions)
		return o
	}()
	agentInstructions.Prompt = ptr("You are Nova, the returns assistant for Lumen.")
	agentInstructions.PromptLineCount = 12
	agentInstructions.InstructionsLineCount = 30
	agentInstructions.Llm = components.StableAgentReadV2Llm{Defaults: &components.StableAgentReadV2Defaults{Model: ptr(components.AIModel("gpt-4.1"))}}
	agentInstructions.KnowledgeBaseTool = &components.StableAgentReadV2KnowledgeBaseTool{Enabled: true}
	agentInstructions.EndTool = &components.StableAgentReadV2EndTool{Enabled: false}
	agentInstructions.ButtonTool = &components.StableAgentReadV2ButtonTool{Enabled: true}
	agentInstructions.CardTool = &components.StableAgentReadV2CardTool{} // present but not enabled
	agentInstructions.Playbooks = []components.StableAgentReadV2Playbook{{PlaybookID: "pb-billing", Description: ptr("Use when the customer asks about an invoice or a refund.")}}
	agentInstructions.Workflows = []components.StableAgentReadV2Workflow{{WorkflowID: "wf-auth", Description: ptr("Verify the caller before anything else.")}}

	return Inputs{
		Project: components.StableProject{ID: "p1", Name: "Returns bot", WorkspaceID: "VzElNm0wjL"},
		Environment: &components.StableEnvironment{
			Alias: "main", Name: "Production", IsMain: true, TrafficPercentage: 100,
			Releases: []components.StableEnvironmentRelease{{Name: "v1", CreatedAt: at(5000)}, {Name: "v2", CreatedAt: at(100)}},
		},
		Agent: agentInstructions,
		Playbooks: []components.StablePlaybookReadV2{
			{ID: "pb-billing", Name: "Billing", Description: ptr("Handles billing."), InstructionsLineCount: 40, UpdatedAt: at(3)},
			{ID: "pb-support", Name: "Support", Description: ptr("General support."), InstructionsLineCount: 20, UpdatedAt: at(600)},
		},
		Functions: []components.StableFunction{
			{ID: "fn-order", Name: "lookupOrder", Description: ptr("Finds an order by number."), Code: strings.Repeat("x", 5000), UpdatedAt: at(30)},
		},
		Tools: []components.StableToolV2{functionTool(t, "tool-1", "fn-order", at(1)), apiTool(t, "tool-2", at(900))},
		Variables: []components.StableVariableV2{
			{ID: "v1", Name: "order_id", UpdatedAt: at(45)},
			{ID: "v2", Name: "customer_name", UpdatedAt: at(2000)},
			{ID: "v3", Name: "sessions", IsSystem: true, UpdatedAt: at(0)},
		},
		Documents:   []components.StableDocument{document(t, "d1", "url", "FAQ"), document(t, "d2", "url", "Shipping"), document(t, "d3", "pdf", "Returns policy")},
		MCPServers:  []components.StableMCPServerV2{{ID: "mcp-1", Name: "Shopify", UpdatedAt: at(4000)}},
		Tests:       []components.StableTest{{ID: "test-1", Name: "Refund over $50", UpdatedAt: at(20)}},
		Transcripts: []components.StableTranscript{{ID: "t-old", CreatedAt: at(500)}, {ID: "t-new", CreatedAt: at(5), EndedAt: ptr(at(4))}},
	}
}

func TestBuildSummarizesTheProject(t *testing.T) {
	o := Build(sampleInputs(t))

	if o.Project != (Project{ID: "p1", Name: "Returns bot", WorkspaceID: "VzElNm0wjL"}) {
		t.Errorf("project: %+v", o.Project)
	}
	if o.Environment.Alias != "main" || o.Environment.LastRelease == nil || o.Environment.LastRelease.Name != "v2" {
		t.Errorf("environment should report the newest release: %+v", o.Environment)
	}
	if o.Agent.Model != "gpt-4.1" || o.Agent.GlobalPrompt.Lines != 12 || o.Agent.Instructions.Lines != 30 {
		t.Errorf("agent: %+v", o.Agent)
	}
	if o.Agent.Instructions.Preview != "Route billing questions to Billing. Everything else goes to Support." {
		t.Errorf("instructions preview should collapse whitespace: %q", o.Agent.Instructions.Preview)
	}
	if got := strings.Join(o.Agent.SystemTools, ","); got != "knowledgeBase,buttons" {
		t.Errorf("system tools: only enabled ones are listed: got %s", got)
	}
	if len(o.Agent.Workflows) != 1 || o.Agent.Workflows[0].When != "Verify the caller before anything else." {
		t.Errorf("workflows: %+v", o.Agent.Workflows)
	}

	counts, _ := json.Marshal(o.Counts)
	if string(counts) != `{"playbooks":2,"workflows":1,"functions":1,"agentTools":2,"variables":2,"documents":3,"mcpServers":1,"tests":1}` {
		t.Errorf("counts (system variables excluded): %s", counts)
	}
	if o.Playbooks[0].Summary != "Use when the customer asks about an invoice or a refund." || !o.Playbooks[0].Routed {
		t.Errorf("a routed playbook is summarized by its routing description: %+v", o.Playbooks[0])
	}
	if o.Playbooks[1].Summary != "General support." || o.Playbooks[1].Routed {
		t.Errorf("an unrouted playbook falls back to its own description: %+v", o.Playbooks[1])
	}
	if o.AgentToolsByType["function"] != 1 || o.AgentToolsByType["api"] != 1 {
		t.Errorf("agent tools by type: %+v", o.AgentToolsByType)
	}
	if strings.Join(o.Variables, ",") != "customer_name,order_id" {
		t.Errorf("variables are the project's own, sorted: %v", o.Variables)
	}
	if o.KnowledgeBase.Documents != 3 || o.KnowledgeBase.ByType["url"] != 2 || o.KnowledgeBase.ByType["pdf"] != 1 {
		t.Errorf("knowledge base: %+v", o.KnowledgeBase)
	}

	var changes []string
	for _, c := range o.RecentChanges {
		changes = append(changes, c.Type+":"+c.Name)
	}
	want := "function tool:lookupOrder,playbook:Billing,test:Refund over $50,function:lookupOrder,variable:order_id,playbook:Support,api tool:Look up an order,variable:customer_name"
	if got := strings.Join(changes, ","); got != want {
		t.Errorf("recent changes, newest first and capped at 8:\n got %s\nwant %s", got, want)
	}

	if len(o.RecentConversations) != 2 || o.RecentConversations[0].ID != "t-new" || !o.RecentConversations[0].Ended || o.RecentConversations[1].Ended {
		t.Errorf("conversations, newest first: %+v", o.RecentConversations)
	}
	if len(o.Rules) == 0 || len(o.DrillDown) == 0 || len(o.Notes) == 0 {
		t.Error("rules, drill-down commands and notes must always be present")
	}
}

func TestBuildWithOnlyTheEssentialsStillRenders(t *testing.T) {
	o := Build(Inputs{
		Project:   components.StableProject{ID: "p1", Name: "Bare"},
		Playbooks: []components.StablePlaybookReadV2{},
		Warnings:  []string{"knowledge base could not be read: HTTP 403"},
	})

	counts, _ := json.Marshal(o.Counts)
	if string(counts) != `{"playbooks":0,"workflows":0,"functions":null,"agentTools":null,"variables":null,"documents":null,"mcpServers":null,"tests":null}` {
		t.Errorf("a part that was read and is empty counts 0; a part that was not read counts null: %s", counts)
	}
	if o.Playbooks == nil || o.Functions == nil || o.Variables == nil || o.RecentChanges == nil || o.RecentConversations == nil ||
		o.Agent.SystemTools == nil || o.Agent.Workflows == nil || o.MCPServers == nil || o.KnowledgeBase.Examples == nil {
		t.Error("lists render as [], never null")
	}
	if len(o.Warnings) != 1 {
		t.Errorf("warnings pass through: %v", o.Warnings)
	}
	if o2 := Build(Inputs{}); o2.Warnings == nil {
		t.Error("no warnings renders as [], not null")
	}
}

// TestTOONKeysArePlain guards against struct tag options reaching the output:
// the TOON encoder prints a json tag verbatim, so "name,omitempty" would
// become the key.
func TestTOONKeysArePlain(t *testing.T) {
	encoded, err := gotoon.Encode(Build(sampleInputs(t)))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(encoded, ",omit") {
		t.Fatalf("a key carries a tag option:\n%s", encoded)
	}
}

func TestClip(t *testing.T) {
	cases := map[string]struct {
		in   string
		n    int
		want string
	}{
		"short":       {"hello", 10, "hello"},
		"whitespace":  {"  a\n\tb   c ", 10, "a b c"},
		"cut":         {"abcdefghij", 5, "abcd…"},
		"unicode":     {"héllo wörld", 6, "héllo…"},
		"cut at word": {"one two three", 5, "one…"},
	}
	for name, c := range cases {
		if got := clip(c.in, c.n); got != c.want {
			t.Errorf("%s: clip(%q, %d) = %q, want %q", name, c.in, c.n, got, c.want)
		}
	}
}

// TestWorstCaseStaysWithinTheBudget builds the largest outline the caps
// allow — every list over its cap, every text far over its clip — and holds
// the TOON rendering to SizeBudget.
func TestWorstCaseStaysWithinTheBudget(t *testing.T) {
	long := strings.Repeat("A very long description that keeps going and going. ", 40)
	longName := strings.Repeat("N", 200)
	in := sampleInputs(t)
	in.Agent.Prompt = &long
	in.Agent.Instructions.Set(&long)
	in.Agent.Workflows = nil
	in.Playbooks, in.Functions, in.Variables, in.Documents, in.MCPServers, in.Tests, in.Transcripts, in.Tools = nil, nil, nil, nil, nil, nil, nil, nil
	for i := 0; i < 100; i++ {
		id := fmt.Sprintf("%024d", i)
		in.Agent.Workflows = append(in.Agent.Workflows, components.StableAgentReadV2Workflow{WorkflowID: id, Description: &long})
		in.Agent.Playbooks = append(in.Agent.Playbooks, components.StableAgentReadV2Playbook{PlaybookID: id, Description: &long})
		in.Playbooks = append(in.Playbooks, components.StablePlaybookReadV2{ID: id, Name: longName, Description: &long, UpdatedAt: at(i)})
		in.Functions = append(in.Functions, components.StableFunction{ID: id, Name: longName, Description: &long, UpdatedAt: at(i)})
		in.Variables = append(in.Variables, components.StableVariableV2{ID: id, Name: longName + id, UpdatedAt: at(i)})
		in.Documents = append(in.Documents, document(t, id, "url", longName))
		in.MCPServers = append(in.MCPServers, components.StableMCPServerV2{ID: id, Name: longName, UpdatedAt: at(i)})
		in.Tests = append(in.Tests, components.StableTest{ID: id, Name: longName, UpdatedAt: at(i)})
		in.Transcripts = append(in.Transcripts, components.StableTranscript{ID: id, CreatedAt: at(i)})
		in.Tools = append(in.Tools, apiTool(t, id, at(i)))
	}

	o := Build(in)
	if len(o.Playbooks) != maxPlaybooks || len(o.Functions) != maxFunctions || len(o.Variables) != maxVariables ||
		len(o.MCPServers) != maxMCPServers || len(o.RecentChanges) != maxRecentChanges ||
		len(o.RecentConversations) != maxConversations || len(o.Agent.Workflows) != maxWorkflows {
		t.Fatalf("a list exceeded its cap: %+v", o.Counts)
	}
	if *o.Counts.Playbooks != 100 || *o.Counts.Documents != 100 {
		t.Errorf("counts must report the true totals: %+v", o.Counts)
	}

	encoded, err := gotoon.Encode(o)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("worst-case outline: %d bytes of TOON (budget %d)", len(encoded), SizeBudget)
	if len(encoded) > SizeBudget {
		t.Fatalf("worst-case outline is %d bytes, over the %d-byte budget", len(encoded), SizeBudget)
	}
}
