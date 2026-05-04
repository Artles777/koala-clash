package proxy

import (
	"context"
	"io"
	"net"
	"strconv"
	"testing"
	"time"
)

func TestStartSOCKS5ReportsBindFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to reserve port: %v", err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port

	if _, _, err := StartSOCKS5(ctx, "127.0.0.1", port, nil); err == nil {
		t.Fatal("expected bind failure")
	}
}

func TestStartSOCKS5SkeletonRejectsTrafficHonestly(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	listener, endpoint, err := StartSOCKS5Skeleton(ctx, "127.0.0.1", 0)
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(endpoint.Host, strconv.Itoa(endpoint.Port)), time.Second)
	if err != nil {
		t.Fatalf("failed to connect to listener: %v", err)
	}
	defer conn.Close()

	if _, err := conn.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		t.Fatalf("failed to write greeting: %v", err)
	}
	reply := make([]byte, 2)
	if _, err := conn.Read(reply); err != nil {
		t.Fatalf("failed to read reply: %v", err)
	}
	if reply[0] != 0x05 || reply[1] != 0xff {
		t.Fatalf("expected no acceptable methods, got %#v", reply)
	}
}

func TestSOCKS5UdpAssociateAccepted(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	listener, endpoint, err := StartSOCKS5(ctx, "127.0.0.1", 0, func(ctx context.Context, network string, address string) (net.Conn, error) {
		var dialer net.Dialer
		return dialer.DialContext(ctx, network, address)
	})
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(endpoint.Host, strconv.Itoa(endpoint.Port)), time.Second)
	if err != nil {
		t.Fatalf("failed to connect to listener: %v", err)
	}
	defer conn.Close()

	replyHost, replyPort := performUDPAssociate(t, conn)
	if replyHost != "127.0.0.1" {
		t.Fatalf("expected loopback UDP relay host, got %q", replyHost)
	}
	if replyPort <= 0 {
		t.Fatalf("expected non-zero UDP relay port, got %d", replyPort)
	}
}

func TestSOCKS5UdpRelay(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	echo, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("failed to start UDP echo server: %v", err)
	}
	defer echo.Close()
	go func() {
		buf := make([]byte, 1024)
		n, addr, err := echo.ReadFromUDP(buf)
		if err != nil {
			return
		}
		_, _ = echo.WriteToUDP(append([]byte("echo:"), buf[:n]...), addr)
	}()

	listener, endpoint, err := StartSOCKS5(ctx, "127.0.0.1", 0, func(ctx context.Context, network string, address string) (net.Conn, error) {
		var dialer net.Dialer
		return dialer.DialContext(ctx, network, address)
	})
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	control, err := net.DialTimeout("tcp", net.JoinHostPort(endpoint.Host, strconv.Itoa(endpoint.Port)), time.Second)
	if err != nil {
		t.Fatalf("failed to connect to listener: %v", err)
	}
	defer control.Close()

	relayHost, relayPort := performUDPAssociate(t, control)
	relayAddr, err := net.ResolveUDPAddr("udp", net.JoinHostPort(relayHost, strconv.Itoa(relayPort)))
	if err != nil {
		t.Fatalf("failed to resolve relay address: %v", err)
	}
	client, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("failed to start UDP client: %v", err)
	}
	defer client.Close()

	echoPort := echo.LocalAddr().(*net.UDPAddr).Port
	packet, err := buildUDPDatagram("127.0.0.1", echoPort, []byte("ping"))
	if err != nil {
		t.Fatalf("failed to build UDP packet: %v", err)
	}
	if _, err := client.WriteToUDP(packet, relayAddr); err != nil {
		t.Fatalf("failed to write UDP packet: %v", err)
	}

	if err := client.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("failed to set read deadline: %v", err)
	}
	buf := make([]byte, 1024)
	n, _, err := client.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("failed to read UDP response: %v", err)
	}
	response, err := parseUDPDatagram(buf[:n])
	if err != nil {
		t.Fatalf("failed to parse UDP response: %v", err)
	}
	if string(response.payload) != "echo:ping" {
		t.Fatalf("unexpected UDP response payload %q", string(response.payload))
	}
}

func performUDPAssociate(t *testing.T, conn net.Conn) (string, int) {
	t.Helper()
	if _, err := conn.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		t.Fatalf("failed to write greeting: %v", err)
	}
	reply := make([]byte, 2)
	if _, err := io.ReadFull(conn, reply); err != nil {
		t.Fatalf("failed to read greeting reply: %v", err)
	}
	if reply[0] != 0x05 || reply[1] != 0x00 {
		t.Fatalf("unexpected greeting reply %#v", reply)
	}

	if _, err := conn.Write([]byte{0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0}); err != nil {
		t.Fatalf("failed to write UDP associate request: %v", err)
	}
	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		t.Fatalf("failed to read UDP associate header: %v", err)
	}
	if header[0] != 0x05 || header[1] != 0x00 {
		t.Fatalf("unexpected UDP associate reply header %#v", header)
	}
	host, port, err := readAddress(conn, header[3])
	if err != nil {
		t.Fatalf("failed to read UDP associate bound address: %v", err)
	}
	return host, port
}
