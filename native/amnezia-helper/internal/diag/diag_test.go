package diag

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestReporterEmitsJSONLShape(t *testing.T) {
	var out bytes.Buffer
	reporter := NewReporter(&out)

	reporter.Emit(LevelInfo, "backend.started", "started", map[string]any{"endpoint": "127.0.0.1:1"})

	var event Event
	if err := json.Unmarshal(bytes.TrimSpace(out.Bytes()), &event); err != nil {
		t.Fatalf("expected JSON event: %v", err)
	}
	if event.Level != LevelInfo {
		t.Fatalf("unexpected level %q", event.Level)
	}
	if event.Event != "backend.started" {
		t.Fatalf("unexpected event %q", event.Event)
	}
	if event.Fields["endpoint"] != "127.0.0.1:1" {
		t.Fatalf("unexpected fields %#v", event.Fields)
	}
}
