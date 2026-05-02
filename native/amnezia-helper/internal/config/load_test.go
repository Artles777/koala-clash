package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFileRejectsUnknownFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	payload := `{
		"version": 1,
		"profile": {
			"type": "wireguard",
			"sourceKind": "self_contained",
			"keys": {"privateKey": "x", "serverPublicKey": "y"},
			"endpoint": {"host": "vpn.example.com", "port": 51820},
			"interface": {"addresses": ["10.0.0.2/32"]},
			"peer": {"allowedIPs": ["0.0.0.0/0"]},
			"unexpected": true
		},
		"localProxy": {"listenHost": "127.0.0.1", "listenPort": 0, "protocols": ["socks5"]}
	}`
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}

	_, err := LoadFile(path)
	if err == nil {
		t.Fatal("expected unknown field to fail")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("expected unknown field error, got %v", err)
	}
}
