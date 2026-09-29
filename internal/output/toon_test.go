package output

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/alpkeskin/gotoon"
	"github.com/spf13/cobra"

	"github.com/voiceflow/cli/internal/sdk/models/components"
	"github.com/voiceflow/cli/internal/sdk/models/operations"
)

// render runs Result the way a command does, with the output flags the root
// command registers, and returns what it printed.
func render(t *testing.T, format string, res interface{}) string {
	t.Helper()
	cmd := &cobra.Command{Use: "test"}
	cmd.Flags().String("output-format", "pretty", "")
	cmd.Flags().String("color", "never", "")
	cmd.Flags().String("jq", "", "")
	cmd.Flags().Bool("include-headers", false, "")
	if err := cmd.Flags().Set("output-format", format); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	cmd.SetOut(&out)
	if err := Result(cmd, res); err != nil {
		t.Fatalf("Result(%s): %v", format, err)
	}
	return out.String()
}

// agentResponse is an agent get response whose instructions are set. The
// instructions are an optional-nullable field, a map[bool]*string underneath.
func agentResponse() operations.StableAgentControllerGetV2Response {
	instructions := "Route refund questions to Refunds."
	prompt := "You are Nova, the returns assistant."
	agent := components.StableAgentReadV2{Prompt: &prompt, PromptLineCount: 1, InstructionsLineCount: 1}
	agent.Instructions.Set(&instructions)
	return operations.StableAgentControllerGetV2Response{
		StableAgentResponseV2: &components.StableAgentResponseV2{Agent: agent},
	}
}

func toolListResponse(t *testing.T) operations.StableToolControllerListV2Response {
	t.Helper()
	var tool components.StableToolV2
	raw := `{"type":"function","id":"tool-1","functionID":"fn-1","description":"Look up an order",` +
		`"createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-02T00:00:00Z","asyncExecution":false,` +
		`"inputVariables":{},"captureResponse":{},"captureInputVariables":{},"messages":null}`
	if err := json.Unmarshal([]byte(raw), &tool); err != nil {
		t.Fatal(err)
	}
	return operations.StableToolControllerListV2Response{
		StableToolListResponseV2: &components.StableToolListResponseV2{Tools: []components.StableToolV2{tool}},
	}
}

func TestTOONKeysCarryNoTagOptions(t *testing.T) {
	out := render(t, "toon", agentResponse())
	if strings.Contains(out, ",omit") {
		t.Fatalf("a key carries a json tag option:\n%s", out)
	}
	if !strings.Contains(out, "prompt:") {
		t.Fatalf("want a plain prompt key:\n%s", out)
	}
}

func TestTOONShowsOptionalNullableFields(t *testing.T) {
	out := render(t, "toon", agentResponse())
	if !strings.Contains(out, "Route refund questions to Refunds.") {
		t.Fatalf("the instructions were set but did not render:\n%s", out)
	}
}

func TestTOONRendersUnionsAsTheAPIShapesThem(t *testing.T) {
	out := render(t, "toon", toolListResponse(t))
	if strings.Contains(out, "StableToolV2") || strings.Contains(out, "UnknownRaw") {
		t.Fatalf("the union's Go wrapper leaked into the output:\n%s", out)
	}
	for _, want := range []string{"functionID: fn-1", "type: function"} {
		if !strings.Contains(out, want) {
			t.Errorf("want %q in:\n%s", want, out)
		}
	}
}

// TestTOONIsTheJSONOutputReencoded holds the two formats together: TOON must
// carry exactly what the JSON output does, only encoded differently.
func TestTOONIsTheJSONOutputReencoded(t *testing.T) {
	for name, res := range map[string]interface{}{
		"agent get": agentResponse(),
		"tool list": toolListResponse(t),
	} {
		var fromJSON interface{}
		if err := json.Unmarshal([]byte(render(t, "json", res)), &fromJSON); err != nil {
			t.Fatalf("%s: json output does not parse: %v", name, err)
		}
		want, err := gotoon.Encode(fromJSON)
		if err != nil {
			t.Fatal(err)
		}
		if got := render(t, "toon", res); got != want {
			t.Errorf("%s: TOON differs from the JSON output re-encoded\n got:\n%s\nwant:\n%s", name, got, want)
		}
	}
}
