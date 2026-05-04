package proof

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/koala-clash/amnezia-helper/internal/config"
	"github.com/koala-clash/amnezia-helper/internal/diag"
)

func TestRunnerRejectsMissingTargetBeforeBackendStart(t *testing.T) {
	var out bytes.Buffer
	runner := NewRunner(config.Config{}, diag.NewReporter(&out), Options{})

	code := runner.Run(context.Background())
	if code != diag.CodeInvalidArgument {
		t.Fatalf("expected %s, got %s", diag.CodeInvalidArgument, code)
	}
	output := out.String()
	if !strings.Contains(output, "connectivity.target_missing") {
		t.Fatalf("expected missing target diagnostic, got %s", output)
	}
	if strings.Contains(output, "backend.starting") {
		t.Fatalf("backend should not start for invalid target: %s", output)
	}
}

func TestRunnerRejectsInvalidURLBeforeBackendStart(t *testing.T) {
	var out bytes.Buffer
	runner := NewRunner(config.Config{}, diag.NewReporter(&out), Options{URL: "ftp://example.com/"})

	code := runner.Run(context.Background())
	if code != diag.CodeInvalidArgument {
		t.Fatalf("expected %s, got %s", diag.CodeInvalidArgument, code)
	}
	output := out.String()
	if !strings.Contains(output, "connectivity.failed") {
		t.Fatalf("expected connectivity failure diagnostic, got %s", output)
	}
	if strings.Contains(output, "backend.starting") {
		t.Fatalf("backend should not start for invalid URL: %s", output)
	}
}
