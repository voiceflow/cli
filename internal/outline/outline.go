// Package outline condenses a Voiceflow project into what `vf context`
// prints: what the agent is, what it is built from, what changed recently,
// and the rules for working on it — sized for an AI agent's context window.
//
// Build is pure: the command fetches, this package summarizes. Every list is
// capped and every text is clipped, so the outline stays small however large
// the project is; the true totals are always reported in Counts.
package outline

import (
	"encoding/json"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/voiceflow/cli/internal/sdk/models/components"
)

// The caps that bound the outline's size.
const (
	maxPlaybooks     = 20
	maxFunctions     = 20
	maxAgentTools    = 15
	maxWorkflows     = 10
	maxVariables     = 30
	maxMCPServers    = 10
	maxDocumentNames = 5
	maxRecentChanges = 8
	maxConversations = 5

	nameChars    = 60
	summaryChars = 120
	previewChars = 300
)

// Inputs is everything the command fetched. Only Project and Agent are
// required; any other part may be missing, and Warnings says why.
type Inputs struct {
	Project     components.StableProject
	Environment *components.StableEnvironment
	Agent       components.StableAgentReadV2
	Playbooks   []components.StablePlaybookReadV2
	Functions   []components.StableFunction
	Tools       []components.StableToolV2
	Variables   []components.StableVariableV2
	Documents   []components.StableDocument
	MCPServers  []components.StableMCPServerV2
	Tests       []components.StableTest
	Transcripts []components.StableTranscript
	Warnings    []string
}

// Outline is the summary.
type Outline struct {
	Project             Project        `json:"project"`
	Environment         Environment    `json:"environment"`
	Agent               Agent          `json:"agent"`
	Counts              Counts         `json:"counts"`
	Playbooks           []Playbook     `json:"playbooks"`
	Functions           []Function     `json:"functions"`
	AgentTools          []Tool         `json:"agentTools"`
	Variables           []string       `json:"variables"`
	KnowledgeBase       KnowledgeBase  `json:"knowledgeBase"`
	MCPServers          []Named        `json:"mcpServers"`
	RecentChanges       []Change       `json:"recentChanges"`
	RecentConversations []Conversation `json:"recentConversations"`
	Rules               []string       `json:"rules"`
	DrillDown           []string       `json:"drillDown"`
	Notes               []string       `json:"notes"`
	Warnings            []string       `json:"warnings"`
}

// Project's UpdatedAt is the project record's own timestamp. When it is later
// than everything in recentChanges, something changed that the outline cannot
// see.
type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	WorkspaceID string    `json:"workspaceID"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Environment struct {
	Alias             string   `json:"alias"`
	Name              string   `json:"name"`
	IsMain            bool     `json:"isMain"`
	TrafficPercentage float64  `json:"trafficPercentage"`
	LastRelease       *Release `json:"lastRelease"`
}

type Release struct {
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

type Agent struct {
	Model        string   `json:"model"`
	GlobalPrompt Text     `json:"globalPrompt"`
	Instructions Text     `json:"instructions"`
	SystemTools  []string `json:"systemTools"`
	Workflows    []Routed `json:"workflows"`
}

// Text is a long field as a line count and an opening excerpt.
type Text struct {
	Lines   int64  `json:"lines"`
	Preview string `json:"preview"`
}

// Routed is a routing entry that has no name of its own: the id and the
// description the agent routes on.
type Routed struct {
	ID   string `json:"id"`
	When string `json:"when"`
}

// Counts are the true totals. A null count means that part of the project
// could not be read; warnings says why.
type Counts struct {
	Playbooks  *int `json:"playbooks"`
	Workflows  int  `json:"workflows"`
	Functions  *int `json:"functions"`
	AgentTools *int `json:"agentTools"`
	Variables  *int `json:"variables"`
	Documents  *int `json:"documents"`
	MCPServers *int `json:"mcpServers"`
	Tests      *int `json:"tests"`
}

// Playbook's Summary is the description the agent routes on when it has
// one, since that says when the playbook runs; otherwise its own description.
type Playbook struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Routed           bool      `json:"routed"`
	Summary          string    `json:"summary"`
	InstructionLines int64     `json:"instructionLines"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// Tool is one of the agent's own tools, named after what it calls: a function
// tool by its function's name, any other by its description.
type Tool struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Function struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Summary   string    `json:"summary"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type KnowledgeBase struct {
	Documents int            `json:"documents"`
	ByType    map[string]int `json:"byType"`
	Examples  []string       `json:"examples"`
}

type Named struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Change struct {
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	ID        string    `json:"id"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Conversation struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	Ended     bool      `json:"ended"`
}

// Rules are the working rules an agent otherwise learns by breaking them.
var Rules = []string{
	"Changes take effect only after 'vf environment compile'; until then the agent keeps serving the previous build.",
	"Test what you are editing with --version-param draft; published serves the last release.",
	"Publishing ('vf environment publish') ships to real users. Ask before running it.",
}

// DrillDown lists the commands that return what the outline leaves out.
var DrillDown = []string{
	"vf agent read-instructions",
	"vf agent read-prompt",
	"vf playbook get --playbook-id <id> --include-instructions",
	"vf function get --function-id <id>",
	"vf tool list --global",
	"vf tool list --playbook-id <id>",
	"vf transcript get --transcript-id <id>",
}

// Notes say what the outline cannot know.
var Notes = []string{
	"recentChanges says when something changed, not who changed it: the API does not report an editor for these resources.",
	"The agent's own instructions and global prompt carry no timestamp, so their edits do not appear in recentChanges. A project.updatedAt later than every entry there means something changed that this outline cannot see.",
}

// Build condenses in into an Outline.
func Build(in Inputs) Outline {
	functionNames := make(map[string]string, len(in.Functions))
	for _, f := range in.Functions {
		functionNames[f.ID] = f.Name
	}
	tools := decodeTools(in.Tools)

	out := Outline{
		Project:     Project{ID: in.Project.ID, Name: in.Project.Name, WorkspaceID: in.Project.WorkspaceID, UpdatedAt: in.Project.UpdatedAt},
		Environment: environment(in.Environment),
		Agent:       agent(in.Agent),
		Counts: Counts{
			Playbooks:  countOf(in.Playbooks),
			Workflows:  len(in.Agent.Workflows),
			Functions:  countOf(in.Functions),
			AgentTools: countOf(in.Tools),
			Variables:  countUserVariables(in.Variables),
			Documents:  countOf(in.Documents),
			MCPServers: countOf(in.MCPServers),
			Tests:      countOf(in.Tests),
		},
		Playbooks:           playbooks(in.Playbooks, in.Agent.Playbooks),
		Functions:           functions(in.Functions),
		AgentTools:          agentTools(tools, functionNames),
		Variables:           variableNames(in.Variables),
		KnowledgeBase:       knowledgeBase(in.Documents),
		MCPServers:          mcpServers(in.MCPServers),
		RecentChanges:       recentChanges(in, tools, functionNames),
		RecentConversations: conversations(in.Transcripts),
		Rules:               Rules,
		DrillDown:           DrillDown,
		Notes:               Notes,
		Warnings:            in.Warnings,
	}
	if out.Warnings == nil {
		out.Warnings = []string{}
	}
	return out
}

func environment(env *components.StableEnvironment) Environment {
	if env == nil {
		return Environment{}
	}
	out := Environment{Alias: env.Alias, Name: env.Name, IsMain: env.IsMain, TrafficPercentage: env.TrafficPercentage}
	for _, r := range env.Releases {
		if out.LastRelease == nil || r.CreatedAt.After(out.LastRelease.CreatedAt) {
			out.LastRelease = &Release{Name: r.Name, CreatedAt: r.CreatedAt}
		}
	}
	return out
}

func agent(a components.StableAgentReadV2) Agent {
	out := Agent{
		Workflows:    []Routed{},
		GlobalPrompt: Text{Lines: a.PromptLineCount},
		Instructions: Text{Lines: a.InstructionsLineCount},
		SystemTools:  systemTools(a),
	}
	if a.Llm.Defaults != nil && a.Llm.Defaults.Model != nil {
		out.Model = string(*a.Llm.Defaults.Model)
	}
	if a.Prompt != nil {
		out.GlobalPrompt.Preview = clip(*a.Prompt, previewChars)
	}
	if instructions, ok := a.Instructions.GetOrZero(); ok {
		out.Instructions.Preview = clip(instructions, previewChars)
	}
	for i, w := range a.Workflows {
		if i == maxWorkflows {
			break
		}
		out.Workflows = append(out.Workflows, Routed{ID: w.WorkflowID, When: clip(deref(w.Description), summaryChars)})
	}
	return out
}

// systemTools names the built-in tools the agent has enabled.
func systemTools(a components.StableAgentReadV2) []string {
	names := []string{}
	add := func(name string, enabled bool) {
		if enabled {
			names = append(names, name)
		}
	}
	if t := a.KnowledgeBaseTool; t != nil {
		add("knowledgeBase", t.Enabled)
	}
	if t := a.WebSearchTool; t != nil {
		add("webSearch", t.Enabled)
	}
	if t := a.ButtonTool; t != nil {
		add("buttons", t.Enabled)
	}
	if t := a.CardTool; t != nil {
		add("cards", t.Enabled)
	}
	if t := a.CarouselTool; t != nil {
		add("carousel", t.Enabled)
	}
	if t := a.CallForwardTool; t != nil {
		add("callForward", t.Enabled)
	}
	if t := a.SkipTurnTool; t != nil {
		add("skipTurn", t.Enabled)
	}
	if t := a.EndTool; t != nil {
		add("end", t.Enabled)
	}
	return names
}

func playbooks(list []components.StablePlaybookReadV2, routes []components.StableAgentReadV2Playbook) []Playbook {
	routing := make(map[string]string, len(routes))
	for _, r := range routes {
		routing[r.PlaybookID] = deref(r.Description)
	}
	out := []Playbook{}
	for i, p := range newestFirst(list, func(p components.StablePlaybookReadV2) time.Time { return p.UpdatedAt }) {
		if i == maxPlaybooks {
			break
		}
		when, routed := routing[p.ID]
		summary := when
		if summary == "" {
			summary = deref(p.Description)
		}
		out = append(out, Playbook{
			ID:               p.ID,
			Name:             clip(p.Name, nameChars),
			Routed:           routed,
			Summary:          clip(summary, summaryChars),
			InstructionLines: p.InstructionsLineCount,
			UpdatedAt:        p.UpdatedAt,
		})
	}
	return out
}

func functions(list []components.StableFunction) []Function {
	out := []Function{}
	for i, f := range newestFirst(list, func(f components.StableFunction) time.Time { return f.UpdatedAt }) {
		if i == maxFunctions {
			break
		}
		out = append(out, Function{ID: f.ID, Name: clip(f.Name, nameChars), Summary: clip(deref(f.Description), summaryChars), UpdatedAt: f.UpdatedAt})
	}
	return out
}

// tool is the part of a tool that every member of the StableToolV2 union
// shares, read through JSON so a new member type cannot break the outline.
type tool struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	Description string    `json:"description"`
	FunctionID  string    `json:"functionID"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func decodeTools(list []components.StableToolV2) []tool {
	out := make([]tool, 0, len(list))
	for _, t := range list {
		data, err := json.Marshal(t)
		if err != nil {
			continue
		}
		var decoded tool
		if json.Unmarshal(data, &decoded) == nil {
			out = append(out, decoded)
		}
	}
	return out
}

func agentTools(tools []tool, functionNames map[string]string) []Tool {
	out := []Tool{}
	for _, t := range tools {
		out = append(out, Tool{ID: t.ID, Type: t.Type, Name: clip(toolName(t, functionNames), nameChars), UpdatedAt: t.UpdatedAt})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	if len(out) > maxAgentTools {
		out = out[:maxAgentTools]
	}
	return out
}

// toolName is what a tool calls: its function's name, else its description.
func toolName(t tool, functionNames map[string]string) string {
	if name := functionNames[t.FunctionID]; name != "" {
		return name
	}
	if t.Description != "" {
		return t.Description
	}
	return t.ID
}

// countOf is len(list), or nil when the list was never fetched. A fetched
// empty list decodes to a non-nil slice, so nil means unknown.
func countOf[T any](list []T) *int {
	if list == nil {
		return nil
	}
	n := len(list)
	return &n
}

func countUserVariables(list []components.StableVariableV2) *int {
	if list == nil {
		return nil
	}
	n := 0
	for _, v := range list {
		if !v.IsSystem {
			n++
		}
	}
	return &n
}

// variableNames lists the project's own variables, not the built-in ones,
// sorted so the outline is stable between calls.
func variableNames(list []components.StableVariableV2) []string {
	names := []string{}
	for _, v := range list {
		if !v.IsSystem {
			names = append(names, v.Name)
		}
	}
	sort.Strings(names)
	if len(names) > maxVariables {
		names = names[:maxVariables]
	}
	for i := range names {
		names[i] = clip(names[i], nameChars)
	}
	return names
}

func knowledgeBase(docs []components.StableDocument) KnowledgeBase {
	out := KnowledgeBase{Documents: len(docs), ByType: map[string]int{}, Examples: []string{}}
	for _, d := range docs {
		var data struct {
			Type string `json:"type"`
			Name string `json:"name"`
		}
		raw, err := json.Marshal(d.Data)
		if err != nil || json.Unmarshal(raw, &data) != nil {
			continue
		}
		if data.Type != "" {
			out.ByType[data.Type]++
		}
		if data.Name != "" && len(out.Examples) < maxDocumentNames {
			out.Examples = append(out.Examples, clip(data.Name, nameChars))
		}
	}
	return out
}

func mcpServers(list []components.StableMCPServerV2) []Named {
	out := []Named{}
	for i, s := range list {
		if i == maxMCPServers {
			break
		}
		out = append(out, Named{ID: s.ID, Name: clip(s.Name, nameChars)})
	}
	return out
}

// recentChanges merges every resource that carries an updatedAt, newest first.
func recentChanges(in Inputs, tools []tool, functionNames map[string]string) []Change {
	var all []Change
	for _, p := range in.Playbooks {
		all = append(all, Change{Type: "playbook", Name: p.Name, ID: p.ID, UpdatedAt: p.UpdatedAt})
	}
	for _, f := range in.Functions {
		all = append(all, Change{Type: "function", Name: f.Name, ID: f.ID, UpdatedAt: f.UpdatedAt})
	}
	for _, t := range tools {
		all = append(all, Change{Type: t.Type + " tool", Name: toolName(t, functionNames), ID: t.ID, UpdatedAt: t.UpdatedAt})
	}
	for _, v := range in.Variables {
		if !v.IsSystem {
			all = append(all, Change{Type: "variable", Name: v.Name, ID: v.ID, UpdatedAt: v.UpdatedAt})
		}
	}
	for _, s := range in.MCPServers {
		all = append(all, Change{Type: "mcp server", Name: s.Name, ID: s.ID, UpdatedAt: s.UpdatedAt})
	}
	for _, t := range in.Tests {
		all = append(all, Change{Type: "test", Name: t.Name, ID: t.ID, UpdatedAt: t.UpdatedAt})
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].UpdatedAt.After(all[j].UpdatedAt) })
	if len(all) > maxRecentChanges {
		all = all[:maxRecentChanges]
	}
	for i := range all {
		all[i].Name = clip(all[i].Name, nameChars)
	}
	if all == nil {
		all = []Change{}
	}
	return all
}

func conversations(list []components.StableTranscript) []Conversation {
	out := []Conversation{}
	for _, t := range list {
		out = append(out, Conversation{ID: t.ID, CreatedAt: t.CreatedAt, Ended: t.EndedAt != nil})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > maxConversations {
		out = out[:maxConversations]
	}
	return out
}

// newestFirst returns a copy of list sorted by updatedAt, newest first, so a
// capped list always keeps the most recently changed entries.
func newestFirst[T any](list []T, updatedAt func(T) time.Time) []T {
	sorted := append([]T(nil), list...)
	sort.SliceStable(sorted, func(i, j int) bool { return updatedAt(sorted[i]).After(updatedAt(sorted[j])) })
	return sorted
}

// clip collapses whitespace and cuts s to at most n runes, marking a cut
// with an ellipsis.
func clip(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:n-1])) + "…"
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
