package config

import (
	"testing"

	"github.com/koala-clash/amnezia-helper/internal/diag"
)

func TestValidateSelfContainedAmneziaWG(t *testing.T) {
	cfg := validConfig()

	if err := Validate(cfg); err != nil {
		t.Fatalf("expected valid config, got %v", err)
	}
}

func TestValidateRejectsGatewayExpansionProfile(t *testing.T) {
	cfg := validConfig()
	cfg.Profile.SourceKind = SourceKindGatewayExpansion

	err := Validate(cfg)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := err.(ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T", err)
	}
	if validationErr.Code != diag.CodeProfileRequiresGatewayExpansion {
		t.Fatalf("expected %s, got %s", diag.CodeProfileRequiresGatewayExpansion, validationErr.Code)
	}
}

func TestValidateRejectsUnsupportedProfileType(t *testing.T) {
	cfg := validConfig()
	cfg.Profile.Type = "xray"

	err := Validate(cfg)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := err.(ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T", err)
	}
	if validationErr.Code != diag.CodeUnsupportedProfileType {
		t.Fatalf("expected %s, got %s", diag.CodeUnsupportedProfileType, validationErr.Code)
	}
}

func TestValidateRejectsMissingRequiredField(t *testing.T) {
	cfg := validConfig()
	cfg.Profile.Keys.PrivateKey = ""

	err := Validate(cfg)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := err.(ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T", err)
	}
	if validationErr.Code != diag.CodeMissingRequiredField {
		t.Fatalf("expected %s, got %s", diag.CodeMissingRequiredField, validationErr.Code)
	}
}

func validConfig() Config {
	return Config{
		Version: 1,
		Profile: Profile{
			Type:       ProfileTypeAmneziaWG,
			SourceKind: SourceKindSelfContained,
			Keys: KeyMaterial{
				PrivateKey:      "client-private-key",
				ServerPublicKey: "server-public-key",
			},
			Endpoint: Endpoint{
				Host: "vpn.example.com",
				Port: 55424,
			},
			Interface: InterfaceConfig{
				Addresses: []string{"10.8.1.2/32"},
				MTU:       1376,
			},
			Peer: PeerConfig{
				AllowedIPs:          []string{"0.0.0.0/0", "::/0"},
				PersistentKeepalive: 25,
			},
		},
		LocalProxy: LocalProxy{
			ListenHost: "127.0.0.1",
			ListenPort: 0,
			Protocols:  []string{"socks5"},
		},
	}
}

