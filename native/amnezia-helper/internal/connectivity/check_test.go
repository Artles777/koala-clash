package connectivity

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/koala-clash/amnezia-helper/internal/proxy"
)

func TestParseURLTarget(t *testing.T) {
	target, err := ParseURLTarget("https://example.com:8443/path?q=1")
	if err != nil {
		t.Fatalf("expected target to parse: %v", err)
	}
	if target.Address != "example.com:8443" {
		t.Fatalf("unexpected address %q", target.Address)
	}
	if target.Path != "/path?q=1" {
		t.Fatalf("unexpected path %q", target.Path)
	}
}

func TestParseURLTargetRejectsUnsupportedScheme(t *testing.T) {
	if _, err := ParseURLTarget("ftp://example.com/"); err == nil {
		t.Fatal("expected unsupported scheme to fail")
	}
}

func TestCheckHTTPThroughSOCKS(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()

	upstreamTarget, err := ParseURLTarget(upstream.URL)
	if err != nil {
		t.Fatalf("failed to parse upstream URL: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	listener, endpoint, err := proxy.StartSOCKS5(ctx, "127.0.0.1", 0, func(ctx context.Context, network string, address string) (net.Conn, error) {
		var dialer net.Dialer
		return dialer.DialContext(ctx, network, address)
	})
	if err != nil {
		t.Fatalf("failed to start SOCKS listener: %v", err)
	}
	defer listener.Close()

	checkCtx, checkCancel := context.WithTimeout(ctx, 5*time.Second)
	defer checkCancel()
	result, err := CheckHTTP(checkCtx, endpoint, upstreamTarget)
	if err != nil {
		t.Fatalf("expected HTTP check to pass: %v", err)
	}
	if result.HTTPStatus != "HTTP/1.1 204 No Content" {
		t.Fatalf("unexpected HTTP status %q", result.HTTPStatus)
	}
}

func TestDialSOCKS5ReportsReplyFailure(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer ln.Close()

	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = io.CopyN(io.Discard, conn, 3)
		_, _ = conn.Write([]byte{0x05, 0x00})
		_, _ = io.CopyN(io.Discard, conn, 10)
		_, _ = conn.Write([]byte{0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
	}()

	port := ln.Addr().(*net.TCPAddr).Port
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err = DialSOCKS5(ctx, proxy.Endpoint{Host: "127.0.0.1", Port: port}, net.JoinHostPort("example.com", strconv.Itoa(80)))
	if err == nil {
		t.Fatal("expected SOCKS reply failure")
	}
	connectivityErr, ok := err.(Error)
	if !ok {
		t.Fatalf("expected connectivity Error, got %T", err)
	}
	if connectivityErr.Code == "" {
		t.Fatal("expected diagnostic code")
	}
}
