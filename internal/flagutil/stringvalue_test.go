package flagutil

import (
	"reflect"
	"testing"

	"github.com/voiceflow/cli/internal/sdk/optionalnullable"
)

// unionWithText is shaped like a generated union that has a string member,
// such as components.TranscriptFilterValue1.
type unionWithText struct {
	Str    *string  `union:"member"`
	Number *float64 `union:"member"`
	Type   string
}

// colour is shaped like a generated string enum.
type colour string

// A JSON flag takes raw text only when its field holds a string. The behaviour
// tests pin this on real flags, but the spec decides which shapes those flags
// have, and a regeneration took away the one the Markup check relied on. No
// flag today is a union with a string member outside a list, so this is the
// only place that case is checked. These types do not change with the spec.
func TestTargetsStringValue(t *testing.T) {
	cases := []struct {
		name string
		typ  reflect.Type
		want bool
	}{
		{"string", reflect.TypeFor[string](), true},
		{"pointer to string", reflect.TypeFor[*string](), true},
		{"string enum", reflect.TypeFor[colour](), true},
		{"optional nullable string", reflect.TypeFor[optionalnullable.OptionalNullable[string]](), true},
		{"union with a string member", reflect.TypeFor[unionWithText](), false},
		{"list of unions", reflect.TypeFor[[]unionWithText](), false},
		{"list of strings", reflect.TypeFor[[]string](), false},
		{"map of strings", reflect.TypeFor[map[string]string](), false},
		{"optional nullable union", reflect.TypeFor[optionalnullable.OptionalNullable[unionWithText]](), false},
	}
	for _, tc := range cases {
		if got := targetsStringValue(tc.typ); got != tc.want {
			t.Errorf("targetsStringValue(%s) = %v, want %v", tc.name, got, tc.want)
		}
	}
}
