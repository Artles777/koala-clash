package main

import "testing"

func TestParseListenOverride(t *testing.T) {
	host, port, err := parseListenOverride("127.0.0.1:10808")
	if err != nil {
		t.Fatalf("expected listen override to parse: %v", err)
	}
	if host != "127.0.0.1" {
		t.Fatalf("unexpected host %q", host)
	}
	if port != 10808 {
		t.Fatalf("unexpected port %d", port)
	}
}

func TestParseListenOverrideRejectsInvalidPort(t *testing.T) {
	if _, _, err := parseListenOverride("127.0.0.1:nope"); err == nil {
		t.Fatal("expected invalid port to fail")
	}
}

