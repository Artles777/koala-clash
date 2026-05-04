package runtime

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/koala-clash/amnezia-helper/internal/config"
	"github.com/koala-clash/amnezia-helper/internal/diag"
)

func TestRunnerMapsBackendConfigFailureToDiagnosticCode(t *testing.T) {
	cfg := runnerConfig()
	cfg.Profile.Keys.PrivateKey = "not-a-wireguard-key"
	var out bytes.Buffer
	runner := NewRunner(cfg, diag.NewReporter(&out), Options{})

	code := runner.Run(context.Background())
	if code != diag.CodeInvalidConfig {
		t.Fatalf("expected %s, got %s", diag.CodeInvalidConfig, code)
	}
	if !strings.Contains(out.String(), "backend.config_rejected") {
		t.Fatalf("expected config rejection diagnostic, got %s", out.String())
	}
}

func runnerConfig() config.Config {
	return config.Config{
		Version: 1,
		Profile: config.Profile{
			Type:       config.ProfileTypeWireGuard,
			SourceKind: config.SourceKindSelfContained,
			Keys: config.KeyMaterial{
				PrivateKey:      "not-used-in-this-test",
				ServerPublicKey: "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=",
			},
			Endpoint: config.Endpoint{Host: "vpn.example.com", Port: 51820},
			Interface: config.InterfaceConfig{
				Addresses: []string{"10.0.0.2/32"},
			},
			Peer: config.PeerConfig{
				AllowedIPs: []string{"0.0.0.0/0"},
			},
		},
		LocalProxy: config.LocalProxy{
			ListenHost: "127.0.0.1",
			ListenPort: 0,
			Protocols:  []string{"socks5"},
		},
	}
}
