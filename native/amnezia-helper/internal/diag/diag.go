package diag

import (
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"
)

type Code string

const (
	CodeProfileRequiresGatewayExpansion Code = "profile_requires_gateway_expansion"
	CodeMissingRequiredField            Code = "missing_required_field"
	CodeUnsupportedProfileType          Code = "unsupported_profile_type"
	CodeInvalidConfig                   Code = "invalid_config"
	CodeInvalidArgument                 Code = "invalid_argument"
	CodeBackendStartFailed              Code = "backend_start_failed"
	CodeSocksBindFailed                 Code = "socks_bind_failed"
	CodeSocksConnectFailed              Code = "socks_connect_failed"
	CodeSocksHandshakeFailed            Code = "socks_handshake_failed"
	CodeBackendDialFailed               Code = "backend_dial_failed"
	CodeRemoteTCPConnectFailed          Code = "remote_tcp_connect_failed"
	CodeRequestTimeout                  Code = "request_timeout"
	CodeReadinessTimeout                Code = "readiness_timeout"
	CodeHandshakeTimeout                Code = "handshake_timeout"
	CodeHandshakeNotObserved            Code = "handshake_not_observed"
	CodeUnsupportedField                Code = "unsupported_field"
	CodeInternalError                   Code = "internal_error"
)

type Level string

const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

type Event struct {
	Timestamp string         `json:"ts"`
	Level     Level          `json:"level"`
	Event     string         `json:"event"`
	Code      Code           `json:"code,omitempty"`
	Message   string         `json:"message,omitempty"`
	Fields    map[string]any `json:"fields,omitempty"`
}

type Reporter struct {
	mu  sync.Mutex
	out io.Writer
}

func NewReporter(out io.Writer) *Reporter {
	return &Reporter{out: out}
}

func (r *Reporter) Emit(level Level, event string, message string, fields map[string]any) {
	r.write(Event{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Event:     event,
		Message:   message,
		Fields:    fields,
	})
}

func (r *Reporter) Error(code Code, event string, message string, fields map[string]any) {
	r.write(Event{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     LevelError,
		Event:     event,
		Code:      code,
		Message:   message,
		Fields:    fields,
	})
}

func (r *Reporter) write(event Event) {
	r.mu.Lock()
	defer r.mu.Unlock()

	payload, err := json.Marshal(event)
	if err != nil {
		fmt.Fprintf(r.out, `{"level":"error","event":"diagnostics.marshal_failed","message":%q}`+"\n", err.Error())
		return
	}
	fmt.Fprintln(r.out, string(payload))
}

func ExitCodeFor(code Code) int {
	switch code {
	case CodeInvalidArgument:
		return 2
	case CodeInvalidConfig, CodeMissingRequiredField, CodeUnsupportedField:
		return 10
	case CodeUnsupportedProfileType:
		return 11
	case CodeProfileRequiresGatewayExpansion:
		return 12
	case CodeBackendStartFailed:
		return 20
	case CodeSocksBindFailed:
		return 21
	case CodeSocksConnectFailed:
		return 24
	case CodeSocksHandshakeFailed:
		return 25
	case CodeBackendDialFailed, CodeRemoteTCPConnectFailed:
		return 26
	case CodeRequestTimeout:
		return 27
	case CodeReadinessTimeout:
		return 22
	case CodeHandshakeNotObserved, CodeHandshakeTimeout:
		return 23
	default:
		return 30
	}
}
