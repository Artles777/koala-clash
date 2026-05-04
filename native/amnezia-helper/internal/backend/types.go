package backend

import (
	"context"
	"net"
	"net/netip"
	"time"

	"github.com/koala-clash/amnezia-helper/internal/diag"
)

const DefaultMTU = 1376

type MappingError struct {
	Code    diag.Code
	Field   string
	Message string
}

func (e MappingError) Error() string {
	if e.Field == "" {
		return e.Message
	}
	return e.Field + ": " + e.Message
}

type RuntimeConfig struct {
	UAPI                  string
	LocalAddresses        []netip.Addr
	DNSServers            []netip.Addr
	MTU                   int
	Endpoint              string
	EndpointHost          string
	EndpointPort          int
	AllowedIPs            []string
	AcceptedIgnoredFields []string
}

type Capabilities struct {
	TCPProxy             bool `json:"tcpProxy"`
	UDPProxy             bool `json:"udpProxy"`
	HandshakeObservation bool `json:"handshakeObservation"`
	SystemTun            bool `json:"systemTun"`
}

type Status struct {
	Started           bool      `json:"started"`
	HandshakeObserved bool      `json:"handshakeObserved"`
	LastHandshakeAt   time.Time `json:"lastHandshakeAt,omitempty"`
	TxBytes           int64     `json:"txBytes"`
	RxBytes           int64     `json:"rxBytes"`
}

type Adapter interface {
	Start(ctx context.Context) error
	Stop() error
	DialContext(ctx context.Context, network string, address string) (net.Conn, error)
	Status(ctx context.Context) (Status, error)
	Capabilities() Capabilities
}
