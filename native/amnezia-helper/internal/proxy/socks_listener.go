package proxy

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strconv"
	"sync"
	"time"
)

type DialContextFunc func(ctx context.Context, network string, address string) (net.Conn, error)

type Options struct {
	Dial        DialContextFunc
	OnDialError func(target string, err error)
}

type Listener struct {
	ln          net.Listener
	dial        DialContextFunc
	onDialError func(target string, err error)
	closeOnce   sync.Once
	connMu      sync.Mutex
	conns       map[net.Conn]struct{}
	udpMu       sync.Mutex
	udpConns    map[*net.UDPConn]struct{}
	wg          sync.WaitGroup
}

type Endpoint struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

func StartSOCKS5(ctx context.Context, host string, port int, dial DialContextFunc) (*Listener, Endpoint, error) {
	return StartSOCKS5WithOptions(ctx, host, port, Options{Dial: dial})
}

func StartSOCKS5WithOptions(ctx context.Context, host string, port int, options Options) (*Listener, Endpoint, error) {
	address := fmt.Sprintf("%s:%d", host, port)
	ln, err := net.Listen("tcp", address)
	if err != nil {
		return nil, Endpoint{}, err
	}

	listener := &Listener{
		ln:          ln,
		dial:        options.Dial,
		onDialError: options.OnDialError,
		conns:       make(map[net.Conn]struct{}),
		udpConns:    make(map[*net.UDPConn]struct{}),
	}
	actual := ln.Addr().(*net.TCPAddr)
	endpoint := Endpoint{Host: host, Port: actual.Port}

	listener.wg.Add(1)
	go listener.acceptLoop(ctx)

	return listener, endpoint, nil
}

func StartSOCKS5Skeleton(ctx context.Context, host string, port int) (*Listener, Endpoint, error) {
	return StartSOCKS5(ctx, host, port, nil)
}

func (l *Listener) Close() error {
	if l == nil || l.ln == nil {
		return nil
	}
	var err error
	l.closeOnce.Do(func() {
		err = l.ln.Close()
		l.connMu.Lock()
		for conn := range l.conns {
			_ = conn.Close()
		}
		l.connMu.Unlock()
		l.udpMu.Lock()
		for conn := range l.udpConns {
			_ = conn.Close()
		}
		l.udpMu.Unlock()
	})
	l.wg.Wait()
	return err
}

func (l *Listener) acceptLoop(ctx context.Context) {
	defer l.wg.Done()

	for {
		conn, err := l.ln.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				return
			}
		}
		l.wg.Add(1)
		go l.handleConn(ctx, conn)
	}
}

func (l *Listener) handleConn(ctx context.Context, conn net.Conn) {
	defer l.wg.Done()
	l.trackConn(conn)
	defer l.untrackConn(conn)

	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))

	if err := l.handleHandshake(ctx, conn); err != nil {
		return
	}
}

func (l *Listener) trackConn(conn net.Conn) {
	l.connMu.Lock()
	defer l.connMu.Unlock()
	l.conns[conn] = struct{}{}
}

func (l *Listener) untrackConn(conn net.Conn) {
	_ = conn.Close()
	l.connMu.Lock()
	defer l.connMu.Unlock()
	delete(l.conns, conn)
}

func (l *Listener) handleHandshake(ctx context.Context, client net.Conn) error {
	header := make([]byte, 2)
	if _, err := io.ReadFull(client, header); err != nil {
		return err
	}
	if header[0] != 0x05 {
		return fmt.Errorf("unsupported SOCKS version")
	}
	methods := make([]byte, int(header[1]))
	if _, err := io.ReadFull(client, methods); err != nil {
		return err
	}
	if l.dial == nil {
		_, _ = client.Write([]byte{0x05, 0xff})
		return fmt.Errorf("SOCKS backend dialer is unavailable")
	}
	if _, err := client.Write([]byte{0x05, 0x00}); err != nil {
		return err
	}

	req := make([]byte, 4)
	if _, err := io.ReadFull(client, req); err != nil {
		return err
	}
	if req[0] != 0x05 {
		_ = writeReply(client, 0x07)
		return fmt.Errorf("unsupported SOCKS request version")
	}

	host, port, err := readAddress(client, req[3])
	if err != nil {
		_ = writeReply(client, 0x08)
		return err
	}

	switch req[1] {
	case 0x01:
		return l.handleConnect(ctx, client, host, port)
	case 0x03:
		return l.handleUDPAssociate(ctx, client)
	default:
		_ = writeReply(client, 0x07)
		return fmt.Errorf("unsupported SOCKS5 command")
	}
}

func (l *Listener) handleConnect(ctx context.Context, client net.Conn, host string, port int) error {
	target := net.JoinHostPort(host, strconv.Itoa(port))

	dialCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	remote, err := l.dial(dialCtx, "tcp", target)
	if err != nil {
		if l.onDialError != nil {
			l.onDialError(target, err)
		}
		_ = writeReply(client, 0x05)
		return err
	}
	defer remote.Close()

	_ = client.SetDeadline(time.Time{})
	if err := writeReply(client, 0x00); err != nil {
		return err
	}

	errCh := make(chan error, 2)
	go func() {
		_, err := io.Copy(remote, client)
		errCh <- err
	}()
	go func() {
		_, err := io.Copy(client, remote)
		errCh <- err
	}()
	<-errCh
	return nil
}

func (l *Listener) handleUDPAssociate(ctx context.Context, control net.Conn) error {
	tcpAddr, ok := l.ln.Addr().(*net.TCPAddr)
	if !ok {
		_ = writeReply(control, 0x01)
		return fmt.Errorf("SOCKS listener address is not TCP")
	}

	relayIP := tcpAddr.IP
	if relayIP == nil || relayIP.IsUnspecified() {
		relayIP = net.ParseIP("127.0.0.1")
	}
	udpConn, err := net.ListenUDP("udp", &net.UDPAddr{IP: relayIP, Port: 0})
	if err != nil {
		_ = writeReply(control, 0x01)
		return err
	}
	l.trackUDPConn(udpConn)
	defer l.untrackUDPConn(udpConn)

	udpAddr := udpConn.LocalAddr().(*net.UDPAddr)
	_ = control.SetDeadline(time.Time{})
	if err := writeReplyWithAddress(control, 0x00, udpAddr.IP, udpAddr.Port); err != nil {
		return err
	}

	assocCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	done := make(chan struct{})
	go func() {
		defer close(done)
		l.runUDPRelay(assocCtx, udpConn)
	}()

	controlClosed := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, control)
		close(controlClosed)
	}()

	select {
	case <-ctx.Done():
	case <-controlClosed:
	}
	cancel()
	_ = udpConn.Close()
	<-done
	return nil
}

func (l *Listener) trackUDPConn(conn *net.UDPConn) {
	l.udpMu.Lock()
	defer l.udpMu.Unlock()
	l.udpConns[conn] = struct{}{}
}

func (l *Listener) untrackUDPConn(conn *net.UDPConn) {
	_ = conn.Close()
	l.udpMu.Lock()
	defer l.udpMu.Unlock()
	delete(l.udpConns, conn)
}

type udpAssociation struct {
	mu     sync.Mutex
	target string
	host   string
	port   int
	conn   net.Conn
	client *net.UDPAddr
}

func (l *Listener) runUDPRelay(ctx context.Context, relay *net.UDPConn) {
	associations := make(map[string]*udpAssociation)
	var assocMu sync.Mutex
	defer func() {
		assocMu.Lock()
		defer assocMu.Unlock()
		for _, assoc := range associations {
			_ = assoc.conn.Close()
		}
	}()

	buffer := make([]byte, 65535)
	for {
		_ = relay.SetReadDeadline(time.Now().Add(time.Second))
		n, clientAddr, err := relay.ReadFromUDP(buffer)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
			}
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			return
		}

		packet, err := parseUDPDatagram(buffer[:n])
		if err != nil {
			continue
		}
		assocMu.Lock()
		assoc := associations[packet.target]
		if assoc == nil {
			dialCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			remote, dialErr := l.dial(dialCtx, "udp", packet.target)
			cancel()
			if dialErr != nil {
				assocMu.Unlock()
				if l.onDialError != nil {
					l.onDialError(packet.target, dialErr)
				}
				continue
			}
			assoc = &udpAssociation{
				target: packet.target,
				host:   packet.host,
				port:   packet.port,
				conn:   remote,
				client: clientAddr,
			}
			associations[packet.target] = assoc
			go l.relayUDPRemoteToClient(ctx, relay, assoc)
		}
		assoc.mu.Lock()
		assoc.client = clientAddr
		assoc.mu.Unlock()
		assocMu.Unlock()

		_, _ = assoc.conn.Write(packet.payload)
	}
}

func (l *Listener) relayUDPRemoteToClient(ctx context.Context, relay *net.UDPConn, assoc *udpAssociation) {
	buffer := make([]byte, 65535)
	for {
		_ = assoc.conn.SetReadDeadline(time.Now().Add(time.Second))
		n, err := assoc.conn.Read(buffer)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
			}
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			return
		}
		packet, err := buildUDPDatagram(assoc.host, assoc.port, buffer[:n])
		if err != nil {
			continue
		}
		assoc.mu.Lock()
		client := assoc.client
		assoc.mu.Unlock()
		if client == nil {
			continue
		}
		_, _ = relay.WriteToUDP(packet, client)
	}
}

type udpPacket struct {
	target  string
	host    string
	port    int
	payload []byte
}

func parseUDPDatagram(data []byte) (udpPacket, error) {
	if len(data) < 4 {
		return udpPacket{}, fmt.Errorf("short SOCKS UDP packet")
	}
	if data[0] != 0 || data[1] != 0 || data[2] != 0 {
		return udpPacket{}, fmt.Errorf("fragmented SOCKS UDP packets are not supported")
	}
	host, port, offset, err := parseAddressBytes(data, data[3], 4)
	if err != nil {
		return udpPacket{}, err
	}
	return udpPacket{
		target:  net.JoinHostPort(host, strconv.Itoa(port)),
		host:    host,
		port:    port,
		payload: append([]byte(nil), data[offset:]...),
	}, nil
}

func buildUDPDatagram(host string, port int, payload []byte) ([]byte, error) {
	address, err := encodeAddress(host, port)
	if err != nil {
		return nil, err
	}
	packet := make([]byte, 0, 3+len(address)+len(payload))
	packet = append(packet, 0, 0, 0)
	packet = append(packet, address...)
	packet = append(packet, payload...)
	return packet, nil
}

func readAddress(reader io.Reader, addressType byte) (string, int, error) {
	header, err := readAddressBytes(reader, addressType)
	if err != nil {
		return "", 0, err
	}
	host, port, _, err := parseAddressBytes(header, addressType, 0)
	return host, port, err
}

func readAddressBytes(reader io.Reader, addressType byte) ([]byte, error) {
	var length int
	switch addressType {
	case 0x01:
		length = 4 + 2
	case 0x03:
		size := make([]byte, 1)
		if _, err := io.ReadFull(reader, size); err != nil {
			return nil, err
		}
		rest := make([]byte, int(size[0])+2)
		if _, err := io.ReadFull(reader, rest); err != nil {
			return nil, err
		}
		return append(size, rest...), nil
	case 0x04:
		length = 16 + 2
	default:
		return nil, fmt.Errorf("unsupported SOCKS address type")
	}

	buf := make([]byte, length)
	if _, err := io.ReadFull(reader, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func parseAddressBytes(data []byte, addressType byte, offset int) (string, int, int, error) {
	var host string
	switch addressType {
	case 0x01:
		if len(data) < offset+4+2 {
			return "", 0, 0, io.ErrUnexpectedEOF
		}
		host = net.IP(data[offset : offset+4]).String()
		offset += 4
	case 0x03:
		if len(data) < offset+1 {
			return "", 0, 0, io.ErrUnexpectedEOF
		}
		length := int(data[offset])
		offset++
		if len(data) < offset+length+2 {
			return "", 0, 0, io.ErrUnexpectedEOF
		}
		host = string(data[offset : offset+length])
		offset += length
	case 0x04:
		if len(data) < offset+16+2 {
			return "", 0, 0, io.ErrUnexpectedEOF
		}
		host = net.IP(data[offset : offset+16]).String()
		offset += 16
	default:
		return "", 0, 0, fmt.Errorf("unsupported SOCKS address type")
	}

	port := int(binary.BigEndian.Uint16(data[offset : offset+2]))
	return host, port, offset + 2, nil
}

func writeReply(writer io.Writer, code byte) error {
	_, err := writer.Write([]byte{0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
	return err
}

func writeReplyWithAddress(writer io.Writer, code byte, ip net.IP, port int) error {
	address, err := encodeAddress(ip.String(), port)
	if err != nil {
		return err
	}
	response := []byte{0x05, code, 0x00}
	response = append(response, address...)
	_, err = writer.Write(response)
	return err
}

func encodeAddress(host string, port int) ([]byte, error) {
	if port < 0 || port > 65535 {
		return nil, fmt.Errorf("invalid SOCKS port")
	}
	portBytes := []byte{byte(port >> 8), byte(port)}
	if ip := net.ParseIP(host); ip != nil {
		if v4 := ip.To4(); v4 != nil {
			return append(append([]byte{0x01}, v4...), portBytes...), nil
		}
		if v6 := ip.To16(); v6 != nil {
			return append(append([]byte{0x04}, v6...), portBytes...), nil
		}
	}
	if len(host) > 255 {
		return nil, fmt.Errorf("SOCKS host is too long")
	}
	result := []byte{0x03, byte(len(host))}
	result = append(result, []byte(host)...)
	result = append(result, portBytes...)
	return result, nil
}
