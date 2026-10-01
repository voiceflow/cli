package flagutil

import (
	"reflect"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/voiceflow/cli/internal/sdk/optionalnullable"
)

// turnPayload is shaped like test turn create's agent payload.
type turnPayload struct {
	Sequential bool `json:"sequential"`
}

type turnName string

// stringFlagTarget has a field of each shape a generated string flag fills.
type stringFlagTarget struct {
	Name     string                                    `json:"name"`
	Kind     turnName                                  `json:"kind"`
	Optional *string                                   `json:"optional,omitempty"`
	Payload  turnPayload                               `json:"payload"`
	Note     optionalnullable.OptionalNullable[string] `json:"note,omitzero"`
	Nested   *struct{ Name string }                    `json:"nested,omitempty"`
}

func TestFieldHoldsText(t *testing.T) {
	target := reflect.TypeFor[stringFlagTarget]()
	for path, want := range map[string]bool{
		"Name":        true,
		"Kind":        true,
		"Optional":    true,
		"Nested.Name": true,
		"Payload":     false,
		"Note":        false,
		"NotAField":   true, // setFieldByPath reports it
	} {
		if got := fieldHoldsText(target, path); got != want {
			t.Errorf("fieldHoldsText(%s) = %v, want %v", path, got, want)
		}
	}
}

// buildFlag runs buildStringField for the string flag m, set to *value, or not
// given at all when value is nil.
func buildFlag(t *testing.T, m FlagMeta, value *string) (stringFlagTarget, error) {
	t.Helper()
	cmd := &cobra.Command{Use: "vf"}
	cmd.Flags().String(m.FlagName, "", "")
	if value != nil {
		if err := cmd.Flags().Set(m.FlagName, *value); err != nil {
			t.Fatal(err)
		}
	}
	var target stringFlagTarget
	err := buildStringField(cmd, reflect.ValueOf(&target).Elem(), m)
	return target, err
}

// buildString runs buildStringField for a required string flag set to value.
func buildString(t *testing.T, flag, path, value string) (stringFlagTarget, error) {
	t.Helper()
	return buildFlag(t, FlagMeta{FlagName: flag, FieldPath: path, Kind: FlagKindString, Required: true}, &value)
}

// A flag that is not required, given ” on purpose or not given at all. Empty
// text for a nullable string is sent as "", as a string flag's ” always was;
// an object has no empty text, so ” leaves it out, as it would a JSON flag.
func TestStringFlagThatIsNotRequiredGivenEmptyOrNothing(t *testing.T) {
	empty := ""
	for _, kind := range []struct {
		name               string
		optional, required bool
	}{
		{"optional", true, false},
		{"neither optional nor required", false, false},
	} {
		t.Run(kind.name, func(t *testing.T) {
			note := FlagMeta{FlagName: "note", FieldPath: "Note", Kind: FlagKindString, Optional: kind.optional, Required: kind.required}
			payload := FlagMeta{FlagName: "payload", FieldPath: "Payload", Kind: FlagKindString, Optional: kind.optional, Required: kind.required}

			got, err := buildFlag(t, note, &empty)
			if value, ok := got.Note.GetOrZero(); err != nil || !ok || value != "" {
				t.Errorf("note given '': Note = %v, err = %v; want empty text", got.Note, err)
			}

			got, err = buildFlag(t, note, nil)
			if err != nil || got.Note.IsSet() {
				t.Errorf("note not given: Note = %v, err = %v; want it left out", got.Note, err)
			}

			for _, value := range []*string{&empty, nil} {
				got, err = buildFlag(t, payload, value)
				if err != nil || got.Payload.Sequential {
					t.Errorf("payload given %v: Payload = %+v, err = %v; want it left out", value, got.Payload, err)
				}
			}
		})
	}
}

func TestStringFlagOnAnObjectTakesJSON(t *testing.T) {
	got, err := buildString(t, "payload", "Payload", `{"sequential":true}`)
	if err != nil || !got.Payload.Sequential {
		t.Fatalf("Payload = %+v, err = %v; want sequential true", got.Payload, err)
	}
}

func TestStringFlagOnANullableStringTakesTextOrNull(t *testing.T) {
	got, err := buildString(t, "note", "Note", "Checks tone")
	if value, ok := got.Note.GetOrZero(); err != nil || !ok || value != "Checks tone" {
		t.Fatalf("Note = %v, err = %v; want the text", got.Note, err)
	}

	got, err = buildString(t, "note", "Note", "null")
	if err != nil || !got.Note.IsNull() {
		t.Fatalf("Note = %v, err = %v; want an explicit null", got.Note, err)
	}
}

func TestStringFlagOnTextIsUnchanged(t *testing.T) {
	// Text that happens to look like JSON is still stored as written.
	got, err := buildString(t, "name", "Name", `{"sequential":true}`)
	if err != nil || got.Name != `{"sequential":true}` {
		t.Fatalf("Name = %q, err = %v; want the text as written", got.Name, err)
	}
}

func TestStringFlagOnAnObjectRejectsText(t *testing.T) {
	_, err := buildString(t, "payload", "Payload", "sequential")
	if err == nil || !strings.Contains(err.Error(), "invalid value for --payload") {
		t.Fatalf("err = %v, want an invalid value error for --payload", err)
	}
}
