package flagutil

import (
	"io"
	"os"
	"strings"
	"testing"
	"time"
)

func TestSilenceMeansNoBodyOnlyForASocketInAgentMode(t *testing.T) {
	cases := []struct {
		name        string
		isAgentMode bool
		stdin       os.FileMode
		want        bool
	}{
		{"socket in agent mode", true, os.ModeSocket, true},
		{"socket outside agent mode", false, os.ModeSocket, false},
		// A pipe is what a shell pipeline gives vf; a slow producer must be read.
		{"pipe in agent mode", true, os.ModeNamedPipe, false},
		{"file in agent mode", true, 0, false},
	}
	for _, tc := range cases {
		if got := silenceMeansNoBody(tc.isAgentMode, tc.stdin); got != tc.want {
			t.Errorf("%s: silenceMeansNoBody = %v, want %v", tc.name, got, tc.want)
		}
	}
}

// silentReader returns a reader that delivers nothing and never closes until
// the test ends.
func silentReader(t *testing.T) io.Reader {
	t.Helper()
	r, w := io.Pipe()
	t.Cleanup(func() { w.Close() })
	return r
}

// writeAfter returns a reader that delivers body after delay, then closes.
func writeAfter(delay time.Duration, body string) io.Reader {
	r, w := io.Pipe()
	go func() {
		time.Sleep(delay)
		io.WriteString(w, body)
		w.Close()
	}()
	return r
}

func TestReadStdinBoundedTreatsSilenceAsNoBody(t *testing.T) {
	started := time.Now()
	data, err := readStdinBounded(silentReader(t), 20*time.Millisecond)
	if err != nil || data != nil {
		t.Fatalf("got (%q, %v), want no body and no error", data, err)
	}
	if waited := time.Since(started); waited > time.Second {
		t.Errorf("waited %s on a silent reader, want about the silence limit", waited)
	}
}

func TestReadStdinBoundedReadsABodyThatStartsInTime(t *testing.T) {
	data, err := readStdinBounded(writeAfter(10*time.Millisecond, `{"prompt":"x"}`), time.Second)
	if err != nil || string(data) != `{"prompt":"x"}` {
		t.Fatalf("got (%q, %v), want the body", data, err)
	}
}

// The limit is on silence, not on the whole read: once anything arrives, the
// rest may take as long as StdinReadTimeout allows.
func TestReadStdinBoundedKeepsReadingAfterTheFirstBytes(t *testing.T) {
	r, w := io.Pipe()
	go func() {
		io.WriteString(w, `{"prompt":`)
		time.Sleep(100 * time.Millisecond)
		io.WriteString(w, `"x"}`)
		w.Close()
	}()
	data, err := readStdinBounded(r, 20*time.Millisecond)
	if err != nil || string(data) != `{"prompt":"x"}` {
		t.Fatalf("got (%q, %v), want the whole body", data, err)
	}
}

func TestReadStdinBoundedReturnsAtOnceOnEOF(t *testing.T) {
	data, err := readStdinBounded(strings.NewReader(""), time.Second)
	if err != nil || len(data) != 0 {
		t.Fatalf("got (%q, %v), want an empty body", data, err)
	}
}

func TestReadStdinBoundedWithoutALimitWaitsForASlowBody(t *testing.T) {
	data, err := readStdinBounded(writeAfter(300*time.Millisecond, `{"prompt":"slow"}`), 0)
	if err != nil || string(data) != `{"prompt":"slow"}` {
		t.Fatalf("got (%q, %v), want the slow body", data, err)
	}
}
