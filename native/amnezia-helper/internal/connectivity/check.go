package connectivity

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/koala-clash/amnezia-helper/internal/diag"
	"github.com/koala-clash/amnezia-helper/internal/proxy"
)

type Stage string

const (
	StageTCPConnectSucceeded Stage = "tcp_connect_succeeded"
	StageRequestSucceeded    Stage = "request_succeeded"
)

type RequestTarget struct {
	URL     string
	Scheme  string
	Host    string
	Port    int
	Path    string
	Address string
}

type Result struct {
	Stage        Stage     `json:"stage"`
	Target       string    `json:"target"`
	HTTPStatus   string    `json:"httpStatus,omitempty"`
	BytesRead    int       `json:"bytesRead,omitempty"`
	DurationMs   int64     `json:"durationMs"`
	CompletedAt  time.Time `json:"completedAt"`
}

type Error struct {
	Code    diag.Code
	Stage   Stage
	Message string
	Err     error
}

func (e Error) Error() string {
	if e.Err == nil {
		return e.Message
	}
	return e.Message + ": " + e.Err.Error()
}

func (e Error) Unwrap() error {
	return e.Err
}

func ParseURLTarget(rawURL string) (RequestTarget, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return RequestTarget{}, Error{Code: diag.CodeInvalidArgument, Message: "invalid --url", Err: err}
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return RequestTarget{}, Error{Code: diag.CodeInvalidArgument, Message: "--url must use http or https"}
	}
	if parsed.Hostname() == "" {
		return RequestTarget{}, Error{Code: diag.CodeInvalidArgument, Message: "--url must include a host"}
	}

	port := 80
	if parsed.Scheme == "https" {
		port = 443
	}
	if parsed.Port() != "" {
		parsedPort, err := strconv.Atoi(parsed.Port())
		if err != nil || parsedPort <= 0 || parsedPort > 65535 {
			return RequestTarget{}, Error{Code: diag.CodeInvalidArgument, Message: "--url has invalid port"}
		}
		port = parsedPort
	}

	path := parsed.EscapedPath()
	if path == "" {
		path = "/"
	}
	if parsed.RawQuery != "" {
		path += "?" + parsed.RawQuery
	}

	return RequestTarget{
		URL:     rawURL,
		Scheme:  parsed.Scheme,
		Host:    parsed.Hostname(),
		Port:    port,
		Path:    path,
		Address: net.JoinHostPort(parsed.Hostname(), strconv.Itoa(port)),
	}, nil
}

func ParseTCPTarget(rawTarget string) (RequestTarget, error) {
	host, portText, err := net.SplitHostPort(rawTarget)
	if err != nil {
		return RequestTarget{}, Error{Code: diag.CodeInvalidArgument, Message: "--target must be host:port", Err: err}
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port <= 0 || port > 65535 {
		return RequestTarget{}, Error{Code: diag.CodeInvalidArgument, Message: "--target has invalid port"}
	}
	if strings.TrimSpace(host) == "" {
		return RequestTarget{}, Error{Code: diag.CodeInvalidArgument, Message: "--target must include a host"}
	}
	return RequestTarget{
		Host:    host,
		Port:    port,
		Address: net.JoinHostPort(host, strconv.Itoa(port)),
	}, nil
}

func CheckTCP(ctx context.Context, endpoint proxy.Endpoint, target RequestTarget) (Result, error) {
	started := time.Now()
	conn, err := DialSOCKS5(ctx, endpoint, target.Address)
	if err != nil {
		return Result{}, err
	}
	_ = conn.Close()
	return Result{
		Stage:       StageTCPConnectSucceeded,
		Target:      target.Address,
		DurationMs:  time.Since(started).Milliseconds(),
		CompletedAt: time.Now().UTC(),
	}, nil
}

func CheckHTTP(ctx context.Context, endpoint proxy.Endpoint, target RequestTarget) (Result, error) {
	started := time.Now()
	conn, err := DialSOCKS5(ctx, endpoint, target.Address)
	if err != nil {
		return Result{}, err
	}
	defer conn.Close()
	return PerformHTTPRequest(ctx, conn, target, started)
}

func PerformHTTPRequest(ctx context.Context, conn net.Conn, target RequestTarget, started time.Time) (Result, error) {
	if target.Scheme == "https" {
		tlsConn := tls.Client(conn, &tls.Config{
			ServerName: target.Host,
			MinVersion: tls.VersionTLS12,
		})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return Result{}, Error{Code: diag.CodeRequestTimeout, Stage: StageRequestSucceeded, Message: "TLS handshake through SOCKS failed", Err: err}
		}
		conn = tlsConn
	}

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}
	hostHeader := target.Host
	if (target.Scheme == "http" && target.Port != 80) || (target.Scheme == "https" && target.Port != 443) {
		hostHeader = net.JoinHostPort(target.Host, strconv.Itoa(target.Port))
	}
	request := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: amnezia-helper-connectivity\r\nConnection: close\r\n\r\n", target.Path, hostHeader)
	if _, err := io.WriteString(conn, request); err != nil {
		return Result{}, Error{Code: diag.CodeRequestTimeout, Stage: StageRequestSucceeded, Message: "failed to write request through SOCKS", Err: err}
	}

	reader := bufio.NewReader(conn)
	status, err := reader.ReadString('\n')
	if err != nil {
		return Result{}, Error{Code: diag.CodeRequestTimeout, Stage: StageRequestSucceeded, Message: "failed to read response through SOCKS", Err: err}
	}
	status = strings.TrimSpace(status)
	if !strings.HasPrefix(status, "HTTP/") {
		return Result{}, Error{Code: diag.CodeRequestTimeout, Stage: StageRequestSucceeded, Message: "remote response is not HTTP"}
	}

	return Result{
		Stage:       StageRequestSucceeded,
		Target:      target.URL,
		HTTPStatus:  status,
		BytesRead:   len(status),
		DurationMs:  time.Since(started).Milliseconds(),
		CompletedAt: time.Now().UTC(),
	}, nil
}

func DialSOCKS5(ctx context.Context, endpoint proxy.Endpoint, target string) (net.Conn, error) {
	var dialer net.Dialer
	proxyAddress := net.JoinHostPort(endpoint.Host, strconv.Itoa(endpoint.Port))
	conn, err := dialer.DialContext(ctx, "tcp", proxyAddress)
	if err != nil {
		return nil, Error{Code: diag.CodeSocksConnectFailed, Stage: StageTCPConnectSucceeded, Message: "failed to connect to local SOCKS listener", Err: err}
	}

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	if _, err := conn.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeSocksHandshakeFailed, Stage: StageTCPConnectSucceeded, Message: "failed to write SOCKS greeting", Err: err}
	}
	reply := make([]byte, 2)
	if _, err := io.ReadFull(conn, reply); err != nil {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeSocksHandshakeFailed, Stage: StageTCPConnectSucceeded, Message: "failed to read SOCKS greeting response", Err: err}
	}
	if reply[0] != 0x05 || reply[1] != 0x00 {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeSocksHandshakeFailed, Stage: StageTCPConnectSucceeded, Message: fmt.Sprintf("SOCKS listener rejected no-auth method with code 0x%02x", reply[1])}
	}

	host, portText, err := net.SplitHostPort(target)
	if err != nil {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeInvalidArgument, Stage: StageTCPConnectSucceeded, Message: "target must be host:port", Err: err}
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port <= 0 || port > 65535 {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeInvalidArgument, Stage: StageTCPConnectSucceeded, Message: "target port is invalid"}
	}

	request, err := buildConnectRequest(host, port)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	if _, err := conn.Write(request); err != nil {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeSocksHandshakeFailed, Stage: StageTCPConnectSucceeded, Message: "failed to write SOCKS CONNECT request", Err: err}
	}

	response := make([]byte, 4)
	if _, err := io.ReadFull(conn, response); err != nil {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeSocksHandshakeFailed, Stage: StageTCPConnectSucceeded, Message: "failed to read SOCKS CONNECT response", Err: err}
	}
	if response[0] != 0x05 || response[1] != 0x00 {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeRemoteTCPConnectFailed, Stage: StageTCPConnectSucceeded, Message: fmt.Sprintf("SOCKS CONNECT failed with reply code 0x%02x", response[1])}
	}
	if err := discardBoundAddress(conn, response[3]); err != nil {
		_ = conn.Close()
		return nil, Error{Code: diag.CodeSocksHandshakeFailed, Stage: StageTCPConnectSucceeded, Message: "failed to read SOCKS bound address", Err: err}
	}
	_ = conn.SetDeadline(time.Time{})
	return conn, nil
}

func buildConnectRequest(host string, port int) ([]byte, error) {
	request := []byte{0x05, 0x01, 0x00}
	if ip := net.ParseIP(host); ip != nil {
		if ipv4 := ip.To4(); ipv4 != nil {
			request = append(request, 0x01)
			request = append(request, ipv4...)
		} else {
			request = append(request, 0x04)
			request = append(request, ip.To16()...)
		}
	} else {
		if len(host) > 255 {
			return nil, Error{Code: diag.CodeInvalidArgument, Stage: StageTCPConnectSucceeded, Message: "target host is too long for SOCKS5"}
		}
		request = append(request, 0x03, byte(len(host)))
		request = append(request, []byte(host)...)
	}
	portBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(portBytes, uint16(port))
	request = append(request, portBytes...)
	return request, nil
}

func discardBoundAddress(reader io.Reader, addressType byte) error {
	switch addressType {
	case 0x01:
		_, err := io.CopyN(io.Discard, reader, 4)
		if err != nil {
			return err
		}
	case 0x03:
		length := make([]byte, 1)
		if _, err := io.ReadFull(reader, length); err != nil {
			return err
		}
		if _, err := io.CopyN(io.Discard, reader, int64(length[0])); err != nil {
			return err
		}
	case 0x04:
		if _, err := io.CopyN(io.Discard, reader, 16); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported bound address type 0x%02x", addressType)
	}
	_, err := io.CopyN(io.Discard, reader, 2)
	return err
}
