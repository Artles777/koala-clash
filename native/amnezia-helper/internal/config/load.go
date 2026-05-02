package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

func LoadFile(path string) (Config, error) {
	var cfg Config

	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, fmt.Errorf("read config: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cfg); err != nil {
		return cfg, fmt.Errorf("parse config JSON: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return cfg, fmt.Errorf("parse config JSON: trailing data")
	}
	ApplyDefaults(&cfg)
	return cfg, nil
}

func ApplyDefaults(cfg *Config) {
	if cfg.LocalProxy.ListenHost == "" {
		cfg.LocalProxy.ListenHost = "127.0.0.1"
	}
	if len(cfg.LocalProxy.Protocols) == 0 {
		cfg.LocalProxy.Protocols = []string{"socks5"}
	}
}
