package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/koala-clash/amnezia-helper/internal/backend"
	"github.com/koala-clash/amnezia-helper/internal/config"
	"github.com/koala-clash/amnezia-helper/internal/diag"
	"github.com/koala-clash/amnezia-helper/internal/proof"
	helperruntime "github.com/koala-clash/amnezia-helper/internal/runtime"
)

const version = "0.4.0-udp-associate"

func main() {
	reporter := diag.NewReporter(os.Stdout)

	if len(os.Args) < 2 {
		reporter.Error(diag.CodeInvalidArgument, "helper.error", "missing command", nil)
		os.Exit(diag.ExitCodeFor(diag.CodeInvalidArgument))
	}

	switch os.Args[1] {
	case "check":
		os.Exit(runCheck(os.Args[2:], reporter))
	case "check-connectivity":
		os.Exit(runConnectivityCheck(os.Args[2:], reporter))
	case "run":
		os.Exit(runHelper(os.Args[2:], reporter))
	case "version":
		fmt.Println(version)
		os.Exit(0)
	default:
		reporter.Error(diag.CodeInvalidArgument, "helper.error", "unknown command", map[string]any{"command": os.Args[1]})
		os.Exit(diag.ExitCodeFor(diag.CodeInvalidArgument))
	}
}

func runCheck(args []string, reporter *diag.Reporter) int {
	fs := flag.NewFlagSet("check", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	configPath := fs.String("config", "", "path to helper config JSON")
	if err := fs.Parse(args); err != nil {
		reporter.Error(diag.CodeInvalidArgument, "helper.error", err.Error(), nil)
		return diag.ExitCodeFor(diag.CodeInvalidArgument)
	}

	cfg, code := loadAndValidate(*configPath, reporter)
	if code != "" {
		return diag.ExitCodeFor(code)
	}
	if code := validateBackendMapping(cfg, reporter); code != "" {
		return diag.ExitCodeFor(code)
	}
	reporter.Emit(diag.LevelInfo, "config.validated", "config is valid", map[string]any{
		"stage":       "config_validated",
		"profileType": cfg.Profile.Type,
		"sourceKind":  cfg.Profile.SourceKind,
	})
	return 0
}

func runConnectivityCheck(args []string, reporter *diag.Reporter) int {
	fs := flag.NewFlagSet("check-connectivity", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	configPath := fs.String("config", "", "path to helper config JSON")
	rawURL := fs.String("url", "", "HTTP or HTTPS URL to request through helper SOCKS endpoint")
	target := fs.String("target", "", "TCP target as host:port for TCP-only verification")
	timeout := fs.Duration("timeout", proof.DefaultTimeout, "overall connectivity check timeout")
	handshakeTimeout := fs.Duration("handshake-timeout", proof.DefaultHandshakeTimeout, "timeout for observing AmneziaWG/WireGuard handshake")
	listen := fs.String("listen", "", "override local listen address as host:port")
	if err := fs.Parse(args); err != nil {
		reporter.Error(diag.CodeInvalidArgument, "helper.error", err.Error(), nil)
		return diag.ExitCodeFor(diag.CodeInvalidArgument)
	}
	if *rawURL != "" && *target != "" {
		reporter.Error(diag.CodeInvalidArgument, "helper.error", "use either --url or --target, not both", nil)
		return diag.ExitCodeFor(diag.CodeInvalidArgument)
	}
	if *timeout <= 0 || *handshakeTimeout <= 0 {
		reporter.Error(diag.CodeInvalidArgument, "helper.error", "--timeout and --handshake-timeout must be positive durations", nil)
		return diag.ExitCodeFor(diag.CodeInvalidArgument)
	}

	cfg, code := loadAndValidate(*configPath, reporter)
	if code != "" {
		return diag.ExitCodeFor(code)
	}
	if code := validateBackendMapping(cfg, reporter); code != "" {
		return diag.ExitCodeFor(code)
	}
	reporter.Emit(diag.LevelInfo, "config.validated", "config is valid", map[string]any{
		"stage":       "config_validated",
		"profileType": cfg.Profile.Type,
		"sourceKind":  cfg.Profile.SourceKind,
	})
	if *listen != "" {
		host, port, err := parseListenOverride(*listen)
		if err != nil {
			reporter.Error(diag.CodeInvalidArgument, "helper.error", err.Error(), nil)
			return diag.ExitCodeFor(diag.CodeInvalidArgument)
		}
		cfg.LocalProxy.ListenHost = host
		cfg.LocalProxy.ListenPort = port
	}

	reporter.Emit(diag.LevelInfo, "connectivity.starting", "connectivity proof is starting", map[string]any{
		"url":                *rawURL,
		"target":             *target,
		"timeoutMs":          durationMillis(*timeout),
		"handshakeTimeoutMs": durationMillis(*handshakeTimeout),
	})

	runner := proof.NewRunner(cfg, reporter, proof.Options{
		URL:              *rawURL,
		Target:           *target,
		Timeout:          *timeout,
		HandshakeTimeout: *handshakeTimeout,
	})
	code = runner.Run(context.Background())
	if code != "" {
		return diag.ExitCodeFor(code)
	}
	return 0
}

func runHelper(args []string, reporter *diag.Reporter) int {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	configPath := fs.String("config", "", "path to helper config JSON")
	stubBackend := fs.Bool("stub-backend", false, "run listener-only development stub")
	listen := fs.String("listen", "", "override local listen address as host:port")
	if err := fs.Parse(args); err != nil {
		reporter.Error(diag.CodeInvalidArgument, "helper.error", err.Error(), nil)
		return diag.ExitCodeFor(diag.CodeInvalidArgument)
	}

	cfg, code := loadAndValidate(*configPath, reporter)
	if code != "" {
		return diag.ExitCodeFor(code)
	}
	if code := validateBackendMapping(cfg, reporter); code != "" {
		return diag.ExitCodeFor(code)
	}
	reporter.Emit(diag.LevelInfo, "config.validated", "config is valid", map[string]any{
		"stage":       "config_validated",
		"profileType": cfg.Profile.Type,
		"sourceKind":  cfg.Profile.SourceKind,
	})
	if *listen != "" {
		host, port, err := parseListenOverride(*listen)
		if err != nil {
			reporter.Error(diag.CodeInvalidArgument, "helper.error", err.Error(), nil)
			return diag.ExitCodeFor(diag.CodeInvalidArgument)
		}
		cfg.LocalProxy.ListenHost = host
		cfg.LocalProxy.ListenPort = port
	}

	reporter.Emit(diag.LevelInfo, "helper.starting", "helper runtime is starting", map[string]any{
		"profileType": cfg.Profile.Type,
		"profileName": cfg.Profile.Name,
	})

	runner := helperruntime.NewRunner(cfg, reporter, helperruntime.Options{StubBackend: *stubBackend})
	code = runner.Run(context.Background())
	if code != "" {
		return diag.ExitCodeFor(code)
	}
	return 0
}

func durationMillis(duration time.Duration) int64 {
	return duration.Milliseconds()
}

func loadAndValidate(path string, reporter *diag.Reporter) (config.Config, diag.Code) {
	var cfg config.Config
	if path == "" {
		code := diag.CodeInvalidArgument
		reporter.Error(code, "helper.error", "missing --config", nil)
		return cfg, code
	}

	loaded, err := config.LoadFile(path)
	if err != nil {
		code := diag.CodeInvalidConfig
		reporter.Error(code, "helper.error", "failed to load config", map[string]any{"error": err.Error()})
		return cfg, code
	}

	if err := config.Validate(loaded); err != nil {
		if validationErr, ok := err.(config.ValidationError); ok {
			reporter.Error(validationErr.Code, "helper.error", validationErr.Message, map[string]any{"field": validationErr.Field})
			return cfg, validationErr.Code
		}
		code := diag.CodeInvalidConfig
		reporter.Error(code, "helper.error", err.Error(), nil)
		return cfg, code
	}
	return loaded, ""
}

func validateBackendMapping(cfg config.Config, reporter *diag.Reporter) diag.Code {
	_, err := backend.BuildRuntimeConfig(cfg)
	if err == nil {
		return ""
	}
	code := diag.CodeInvalidConfig
	fields := map[string]any{"error": err.Error()}
	if mappingErr, ok := err.(backend.MappingError); ok {
		code = mappingErr.Code
		fields["field"] = mappingErr.Field
	}
	reporter.Error(code, "backend.config_rejected", "failed to map helper config into AmneziaWG runtime config", fields)
	return code
}

func parseListenOverride(value string) (string, int, error) {
	host, portText, err := net.SplitHostPort(value)
	if err != nil {
		lastColon := strings.LastIndex(value, ":")
		if lastColon <= 0 || lastColon == len(value)-1 {
			return "", 0, fmt.Errorf("--listen must be host:port")
		}
		host = value[:lastColon]
		portText = value[lastColon+1:]
	}

	port, err := strconv.Atoi(portText)
	if err != nil {
		return "", 0, fmt.Errorf("--listen port must be a number")
	}
	if host == "" || port < 0 || port > 65535 {
		return "", 0, fmt.Errorf("--listen must contain a valid host and port")
	}
	return host, port, nil
}
