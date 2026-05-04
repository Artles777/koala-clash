package backend

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	awgconn "github.com/amnezia-vpn/amneziawg-go/conn"
	awgdevice "github.com/amnezia-vpn/amneziawg-go/device"
	awgtun "github.com/amnezia-vpn/amneziawg-go/tun"
	awgnetstack "github.com/amnezia-vpn/amneziawg-go/tun/netstack"

	"github.com/koala-clash/amnezia-helper/internal/config"
)

type AmneziaWG struct {
	cfg     RuntimeConfig
	logName string

	mu      sync.Mutex
	device  *awgdevice.Device
	tunDev  awgtun.Device
	net     *awgnetstack.Net
	started bool
}

func NewAmneziaWG(cfg config.Config) (*AmneziaWG, RuntimeConfig, error) {
	runtimeConfig, err := BuildRuntimeConfig(cfg)
	if err != nil {
		return nil, RuntimeConfig{}, err
	}
	name := cfg.Profile.Name
	if name == "" {
		name = cfg.Profile.Type
	}
	return &AmneziaWG{cfg: runtimeConfig, logName: name}, runtimeConfig, nil
}

func (a *AmneziaWG) Start(ctx context.Context) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.started {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	tunDev, netStack, err := awgnetstack.CreateNetTUN(a.cfg.LocalAddresses, a.cfg.DNSServers, a.cfg.MTU)
	if err != nil {
		return fmt.Errorf("create userspace netstack: %w", err)
	}

	logger := &awgdevice.Logger{
		Verbosef: func(format string, args ...any) {
			fmt.Fprintf(os.Stderr, "amneziawg verbose: "+format+"\n", args...)
		},
		Errorf: func(format string, args ...any) {
			fmt.Fprintf(os.Stderr, "amneziawg error: "+format+"\n", args...)
		},
	}
	dev := awgdevice.NewDevice(tunDev, awgconn.NewStdNetBind(), logger)

	uapi, err := resolveEndpointForUAPI(ctx, a.cfg, net.DefaultResolver.LookupIPAddr)
	if err != nil {
		dev.Close()
		return err
	}

	if err := dev.IpcSet(uapi); err != nil {
		dev.Close()
		return fmt.Errorf("apply backend UAPI config: %w", err)
	}
	if err := dev.Up(); err != nil {
		dev.Close()
		return fmt.Errorf("bring backend up: %w", err)
	}

	a.tunDev = tunDev
	a.net = netStack
	a.device = dev
	a.started = true
	return nil
}

type endpointLookupFunc func(ctx context.Context, host string) ([]net.IPAddr, error)

func resolveEndpointForUAPI(
	ctx context.Context,
	cfg RuntimeConfig,
	lookup endpointLookupFunc,
) (string, error) {
	if cfg.EndpointHost == "" || cfg.EndpointPort <= 0 {
		return cfg.UAPI, nil
	}

	resolvedHost := cfg.EndpointHost
	if _, err := netip.ParseAddr(cfg.EndpointHost); err != nil {
		ips, lookupErr := lookup(ctx, cfg.EndpointHost)
		if lookupErr != nil {
			return "", fmt.Errorf("resolve endpoint host %s: %w", cfg.EndpointHost, lookupErr)
		}
		resolved, ok := selectEndpointIP(ips)
		if !ok {
			return "", fmt.Errorf("resolve endpoint host %s: no IP addresses returned", cfg.EndpointHost)
		}
		resolvedHost = resolved
	}

	original := "endpoint=" + cfg.Endpoint + "\n"
	resolvedEndpoint := net.JoinHostPort(resolvedHost, strconv.Itoa(cfg.EndpointPort))
	replacement := "endpoint=" + resolvedEndpoint + "\n"
	if strings.Contains(cfg.UAPI, original) {
		return strings.Replace(cfg.UAPI, original, replacement, 1), nil
	}
	return cfg.UAPI, nil
}

func selectEndpointIP(ips []net.IPAddr) (string, bool) {
	candidates := make([]string, 0, len(ips))
	for _, item := range ips {
		if item.IP == nil {
			continue
		}
		ip := item.IP
		if v4 := ip.To4(); v4 != nil {
			candidates = append(candidates, v4.String())
			continue
		}
		if v16 := ip.To16(); v16 != nil {
			candidates = append(candidates, v16.String())
		}
	}
	if len(candidates) == 0 {
		return "", false
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		leftIP := net.ParseIP(candidates[i])
		rightIP := net.ParseIP(candidates[j])
		leftV4 := leftIP != nil && leftIP.To4() != nil
		rightV4 := rightIP != nil && rightIP.To4() != nil
		if leftV4 != rightV4 {
			return leftV4
		}
		return candidates[i] < candidates[j]
	})
	return candidates[0], true
}

func (a *AmneziaWG) Stop() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.started {
		return nil
	}
	if a.device != nil {
		a.device.Close()
	} else if a.tunDev != nil {
		_ = a.tunDev.Close()
	}
	a.device = nil
	a.tunDev = nil
	a.net = nil
	a.started = false
	return nil
}

func (a *AmneziaWG) DialContext(ctx context.Context, network string, address string) (net.Conn, error) {
	a.mu.Lock()
	netStack := a.net
	started := a.started
	a.mu.Unlock()

	if !started || netStack == nil {
		return nil, fmt.Errorf("backend is not started")
	}
	return netStack.DialContext(ctx, network, address)
}

func (a *AmneziaWG) Status(ctx context.Context) (Status, error) {
	a.mu.Lock()
	dev := a.device
	started := a.started
	a.mu.Unlock()

	if !started || dev == nil {
		return Status{}, nil
	}
	select {
	case <-ctx.Done():
		return Status{Started: true}, ctx.Err()
	default:
	}

	raw, err := dev.IpcGet()
	if err != nil {
		return Status{Started: true}, err
	}
	status := parseStatus(raw)
	status.Started = true
	return status, nil
}

func (a *AmneziaWG) Capabilities() Capabilities {
	return Capabilities{
		TCPProxy:             true,
		UDPProxy:             true,
		HandshakeObservation: true,
		SystemTun:            false,
	}
}

func parseStatus(raw string) Status {
	status := Status{}
	var handshakeSec int64
	var handshakeNsec int64

	for _, line := range strings.Split(raw, "\n") {
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch key {
		case "last_handshake_time_sec":
			handshakeSec, _ = strconv.ParseInt(value, 10, 64)
		case "last_handshake_time_nsec":
			handshakeNsec, _ = strconv.ParseInt(value, 10, 64)
		case "tx_bytes":
			status.TxBytes, _ = strconv.ParseInt(value, 10, 64)
		case "rx_bytes":
			status.RxBytes, _ = strconv.ParseInt(value, 10, 64)
		}
	}

	if handshakeSec > 0 {
		status.HandshakeObserved = true
		status.LastHandshakeAt = time.Unix(handshakeSec, handshakeNsec).UTC()
	}
	return status
}
