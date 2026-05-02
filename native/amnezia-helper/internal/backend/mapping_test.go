package backend

import (
	"bytes"
	"context"
	"encoding/base64"
	"net"
	"strings"
	"testing"

	"github.com/koala-clash/amnezia-helper/internal/config"
	"github.com/koala-clash/amnezia-helper/internal/diag"
)

func TestBuildRuntimeConfigMapsWireGuardFields(t *testing.T) {
	cfg := validBackendConfig(config.ProfileTypeWireGuard)

	runtimeConfig, err := BuildRuntimeConfig(cfg)
	if err != nil {
		t.Fatalf("expected runtime config, got %v", err)
	}

	if runtimeConfig.MTU != 1376 {
		t.Fatalf("unexpected MTU %d", runtimeConfig.MTU)
	}
	if runtimeConfig.Endpoint != "vpn.example.com:55424" {
		t.Fatalf("unexpected endpoint %q", runtimeConfig.Endpoint)
	}
	if len(runtimeConfig.AcceptedIgnoredFields) != 0 {
		t.Fatalf("expected no accepted-but-ignored fields, got %#v", runtimeConfig.AcceptedIgnoredFields)
	}
	for _, expected := range []string{
		"private_key=",
		"replace_peers=true",
		"public_key=",
		"preshared_key=",
		"endpoint=vpn.example.com:55424",
		"persistent_keepalive_interval=25",
		"allowed_ip=0.0.0.0/0",
	} {
		if !strings.Contains(runtimeConfig.UAPI, expected) {
			t.Fatalf("expected UAPI to contain %q:\n%s", expected, runtimeConfig.UAPI)
		}
	}
}

func TestBuildRuntimeConfigMapsAmneziaFields(t *testing.T) {
	cfg := validBackendConfig(config.ProfileTypeAmneziaWG)
	cfg.Profile.Amnezia.Jc = "3"
	cfg.Profile.Amnezia.S1 = "15"
	cfg.Profile.Amnezia.H1 = "1020325451"

	runtimeConfig, err := BuildRuntimeConfig(cfg)
	if err != nil {
		t.Fatalf("expected runtime config, got %v", err)
	}
	for _, expected := range []string{"jc=3", "s1=15", "h1=1020325451"} {
		if !strings.Contains(runtimeConfig.UAPI, expected) {
			t.Fatalf("expected UAPI to contain %q:\n%s", expected, runtimeConfig.UAPI)
		}
	}
}

func TestBuildRuntimeConfigRejectsAmneziaFieldsForWireGuard(t *testing.T) {
	cfg := validBackendConfig(config.ProfileTypeWireGuard)
	cfg.Profile.Amnezia.Jc = "3"

	_, err := BuildRuntimeConfig(cfg)
	if err == nil {
		t.Fatal("expected mapping error")
	}
	mappingErr, ok := err.(MappingError)
	if !ok {
		t.Fatalf("expected MappingError, got %T", err)
	}
	if mappingErr.Code != diag.CodeUnsupportedField {
		t.Fatalf("expected %s, got %s", diag.CodeUnsupportedField, mappingErr.Code)
	}
}

func TestBuildRuntimeConfigRejectsInvalidKey(t *testing.T) {
	cfg := validBackendConfig(config.ProfileTypeWireGuard)
	cfg.Profile.Keys.PrivateKey = "not-a-key"

	_, err := BuildRuntimeConfig(cfg)
	if err == nil {
		t.Fatal("expected mapping error")
	}
	mappingErr, ok := err.(MappingError)
	if !ok {
		t.Fatalf("expected MappingError, got %T", err)
	}
	if mappingErr.Field != "profile.keys.privateKey" {
		t.Fatalf("unexpected field %q", mappingErr.Field)
	}
}

func TestResolveEndpointForUAPIResolvesDomainEndpoint(t *testing.T) {
	cfg := RuntimeConfig{
		UAPI:         "private_key=abc\nendpoint=vpn.example.com:55424\nallowed_ip=0.0.0.0/0\n",
		Endpoint:     "vpn.example.com:55424",
		EndpointHost: "vpn.example.com",
		EndpointPort: 55424,
	}

	uapi, err := resolveEndpointForUAPI(
		context.Background(),
		cfg,
		func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{
				{IP: net.ParseIP("2001:db8::10")},
				{IP: net.ParseIP("203.0.113.10")},
			}, nil
		},
	)
	if err != nil {
		t.Fatalf("expected resolved UAPI, got %v", err)
	}
	if strings.Contains(uapi, "endpoint=vpn.example.com:55424") {
		t.Fatalf("expected domain endpoint to be replaced:\n%s", uapi)
	}
	if !strings.Contains(uapi, "endpoint=203.0.113.10:55424") {
		t.Fatalf("expected IPv4 endpoint to be selected:\n%s", uapi)
	}
}

func TestResolveEndpointForUAPIKeepsIPEndpoint(t *testing.T) {
	cfg := RuntimeConfig{
		UAPI:         "endpoint=203.0.113.10:55424\n",
		Endpoint:     "203.0.113.10:55424",
		EndpointHost: "203.0.113.10",
		EndpointPort: 55424,
	}

	uapi, err := resolveEndpointForUAPI(
		context.Background(),
		cfg,
		func(context.Context, string) ([]net.IPAddr, error) {
			t.Fatal("IP endpoint should not be resolved")
			return nil, nil
		},
	)
	if err != nil {
		t.Fatalf("expected UAPI, got %v", err)
	}
	if uapi != cfg.UAPI {
		t.Fatalf("expected UAPI to stay unchanged, got:\n%s", uapi)
	}
}

func TestParseStatusDetectsHandshake(t *testing.T) {
	status := parseStatus("last_handshake_time_sec=1700000000\nlast_handshake_time_nsec=5\ntx_bytes=7\nrx_bytes=9\n")
	if !status.HandshakeObserved {
		t.Fatal("expected handshake to be observed")
	}
	if status.TxBytes != 7 || status.RxBytes != 9 {
		t.Fatalf("unexpected byte counters: tx=%d rx=%d", status.TxBytes, status.RxBytes)
	}
}

func validBackendConfig(profileType string) config.Config {
	return config.Config{
		Version: 1,
		Profile: config.Profile{
			Type:       profileType,
			SourceKind: config.SourceKindSelfContained,
			Keys: config.KeyMaterial{
				PrivateKey:      key(1),
				ServerPublicKey: key(2),
				PresharedKey:    key(3),
			},
			Endpoint: config.Endpoint{Host: "vpn.example.com", Port: 55424},
			Interface: config.InterfaceConfig{
				Addresses: []string{"10.8.1.2/32"},
				MTU:       1376,
				DNS:       []string{"1.1.1.1"},
			},
			Peer: config.PeerConfig{
				AllowedIPs:          []string{"0.0.0.0/0"},
				PersistentKeepalive: 25,
			},
		},
		LocalProxy: config.LocalProxy{
			ListenHost: "127.0.0.1",
			ListenPort: 0,
			Protocols:  []string{"socks5"},
			UDP:        true,
		},
	}
}

func key(value byte) string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{value}, 32))
}
