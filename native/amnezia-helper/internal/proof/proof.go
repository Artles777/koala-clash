package proof

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/koala-clash/amnezia-helper/internal/backend"
	"github.com/koala-clash/amnezia-helper/internal/config"
	"github.com/koala-clash/amnezia-helper/internal/connectivity"
	"github.com/koala-clash/amnezia-helper/internal/diag"
	"github.com/koala-clash/amnezia-helper/internal/proxy"
)

const (
	DefaultTimeout          = 60 * time.Second
	DefaultHandshakeTimeout = 30 * time.Second
)

type Options struct {
	URL              string
	Target           string
	Timeout          time.Duration
	HandshakeTimeout time.Duration
}

type Runner struct {
	cfg      config.Config
	reporter *diag.Reporter
	options  Options
}

func NewRunner(cfg config.Config, reporter *diag.Reporter, options Options) *Runner {
	if options.Timeout == 0 {
		options.Timeout = DefaultTimeout
	}
	if options.HandshakeTimeout == 0 {
		options.HandshakeTimeout = DefaultHandshakeTimeout
	}
	return &Runner{cfg: cfg, reporter: reporter, options: options}
}

func (r *Runner) Run(ctx context.Context) diag.Code {
	runCtx, cancel := context.WithTimeout(ctx, r.options.Timeout)
	defer cancel()

	target, useHTTP, code := r.resolveTarget()
	if code != "" {
		return code
	}

	adapter, runtimeConfig, err := backend.NewAmneziaWG(r.cfg)
	if err != nil {
		code := diag.CodeBackendStartFailed
		fields := map[string]any{"error": err.Error()}
		if mappingErr, ok := err.(backend.MappingError); ok {
			code = mappingErr.Code
			fields["field"] = mappingErr.Field
		}
		r.reporter.Error(code, "backend.config_rejected", "failed to map helper config into AmneziaWG runtime config", fields)
		return code
	}

	r.reporter.Emit(diag.LevelInfo, "backend.config_mapped", "helper config mapped to AmneziaWG userspace backend", map[string]any{
		"endpoint":       runtimeConfig.Endpoint,
		"allowedIPs":     runtimeConfig.AllowedIPs,
		"addressCount":   len(runtimeConfig.LocalAddresses),
		"dnsServerCount": len(runtimeConfig.DNSServers),
		"mtu":            runtimeConfig.MTU,
		"capabilities":   adapter.Capabilities(),
	})
	if len(runtimeConfig.DNSServers) == 0 {
		r.reporter.Emit(diag.LevelWarn, "backend.dns_missing", "no tunnel DNS servers were provided; SOCKS domain targets may fail unless clients send IP targets", nil)
	}
	for _, ignored := range runtimeConfig.AcceptedIgnoredFields {
		r.reporter.Emit(diag.LevelWarn, "backend.field_ignored", "field is accepted but not implemented by v1 runtime", map[string]any{
			"field": ignored,
		})
	}

	r.reporter.Emit(diag.LevelInfo, "backend.starting", "starting AmneziaWG userspace backend", nil)
	if err := adapter.Start(runCtx); err != nil {
		r.reporter.Error(diag.CodeBackendStartFailed, "backend.start_failed", "failed to start AmneziaWG userspace backend", map[string]any{
			"error": err.Error(),
		})
		return diag.CodeBackendStartFailed
	}
	defer func() {
		if err := adapter.Stop(); err != nil {
			fmt.Fprintf(os.Stderr, "backend stop failed: %v\n", err)
		}
	}()
	r.reporter.Emit(diag.LevelInfo, "backend.started", "AmneziaWG userspace backend started", map[string]any{
		"stage":    "backend_started",
		"endpoint": runtimeConfig.Endpoint,
	})

	listener, endpoint, err := proxy.StartSOCKS5WithOptions(runCtx, r.cfg.LocalProxy.ListenHost, r.cfg.LocalProxy.ListenPort, proxy.Options{
		Dial: adapter.DialContext,
		OnDialError: func(target string, err error) {
			r.reporter.Error(diag.CodeBackendDialFailed, "connectivity.backend_dial_failed", "backend failed to open TCP target through userspace tunnel", map[string]any{
				"target": target,
				"error":  err.Error(),
			})
		},
	})
	if err != nil {
		r.reporter.Error(diag.CodeSocksBindFailed, "helper.error", "failed to bind local SOCKS5 listener", map[string]any{
			"error": err.Error(),
			"host":  r.cfg.LocalProxy.ListenHost,
			"port":  r.cfg.LocalProxy.ListenPort,
		})
		return diag.CodeSocksBindFailed
	}
	defer func() {
		if err := listener.Close(); err != nil {
			fmt.Fprintf(os.Stderr, "listener close failed: %v\n", err)
		}
	}()

	r.reporter.Emit(diag.LevelInfo, "proxy.listening", "local SOCKS5 listener is bound", map[string]any{
		"stage": "socks_ready",
		"host": endpoint.Host,
		"port": endpoint.Port,
	})
	r.reporter.Emit(diag.LevelWarn, "readiness.handshake_pending", "backend and SOCKS are started, but peer handshake has not been observed yet", map[string]any{
		"localProxy": endpoint,
	})

	handshakeCh := make(chan backend.Status, 1)
	go r.waitForHandshake(runCtx, adapter, handshakeCh)

	tcpCtx, tcpCancel := context.WithTimeout(runCtx, r.options.Timeout)
	defer tcpCancel()

	if useHTTP {
		started := time.Now()
		conn, err := connectivity.DialSOCKS5(tcpCtx, endpoint, target.Address)
		if err != nil {
			return r.reportConnectivityFailure(err, target)
		}
		r.reporter.Emit(diag.LevelInfo, "connectivity.tcp_connect_succeeded", "SOCKS TCP CONNECT succeeded through helper", map[string]any{
			"stage":      "tcp_connect_succeeded",
			"target":     target.Address,
			"durationMs": time.Since(started).Milliseconds(),
		})
		result, err := connectivity.PerformHTTPRequest(tcpCtx, conn, target, started)
		_ = conn.Close()
		if err != nil {
			return r.reportConnectivityFailure(err, target)
		}
		r.reporter.Emit(diag.LevelInfo, "connectivity.request_succeeded", "HTTP request succeeded through helper SOCKS endpoint", map[string]any{
			"stage":      "request_succeeded",
			"target":     result.Target,
			"httpStatus": result.HTTPStatus,
			"bytesRead":  result.BytesRead,
			"durationMs": result.DurationMs,
		})
	} else {
		result, err := connectivity.CheckTCP(tcpCtx, endpoint, target)
		if err != nil {
			return r.reportConnectivityFailure(err, target)
		}
		r.reporter.Emit(diag.LevelInfo, "connectivity.tcp_connect_succeeded", "SOCKS TCP CONNECT succeeded through helper", map[string]any{
			"stage":      "tcp_connect_succeeded",
			"target":     result.Target,
			"durationMs": result.DurationMs,
		})
		r.reporter.Emit(diag.LevelWarn, "connectivity.request_skipped", "no --url was provided, so HTTP request verification was skipped", map[string]any{
			"target": target.Address,
		})
	}

	status, code := r.awaitHandshakeAfterTraffic(runCtx, handshakeCh, adapter)
	if code != "" {
		return code
	}
	r.reporter.Emit(diag.LevelInfo, "handshake.observed", "peer handshake observed", map[string]any{
		"stage":           "handshake_observed",
		"lastHandshakeAt": status.LastHandshakeAt,
		"txBytes":         status.TxBytes,
		"rxBytes":         status.RxBytes,
	})
	r.reporter.Emit(diag.LevelInfo, "helper.ready", "backend, SOCKS listener, and peer handshake are ready", map[string]any{
		"stage": "helper_ready",
	})

	event := "connectivity.verified"
	message := "helper TCP connectivity is verified"
	if useHTTP {
		message = "helper TCP and HTTP request connectivity is verified"
	}
	r.reporter.Emit(diag.LevelInfo, event, message, map[string]any{
		"stage":             "connectivity_verified",
		"target":            target.Address,
		"requestVerified":   useHTTP,
		"handshakeObserved": true,
	})
	return ""
}

func (r *Runner) resolveTarget() (connectivity.RequestTarget, bool, diag.Code) {
	if r.options.URL != "" {
		target, err := connectivity.ParseURLTarget(r.options.URL)
		if err != nil {
			return connectivity.RequestTarget{}, false, r.reportConnectivityFailure(err, connectivity.RequestTarget{})
		}
		return target, true, ""
	}
	if r.options.Target == "" {
		r.reporter.Error(diag.CodeInvalidArgument, "connectivity.target_missing", "provide --url for full request verification or --target host:port for TCP-only verification", nil)
		return connectivity.RequestTarget{}, false, diag.CodeInvalidArgument
	}
	target, err := connectivity.ParseTCPTarget(r.options.Target)
	if err != nil {
		return connectivity.RequestTarget{}, false, r.reportConnectivityFailure(err, connectivity.RequestTarget{})
	}
	return target, false, ""
}

func (r *Runner) waitForHandshake(ctx context.Context, adapter backend.Adapter, out chan<- backend.Status) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	deadline := time.NewTimer(r.options.HandshakeTimeout)
	defer deadline.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-deadline.C:
			return
		case <-ticker.C:
			status, err := adapter.Status(ctx)
			if err != nil {
				r.reporter.Emit(diag.LevelWarn, "backend.status_unavailable", "failed to read backend status", map[string]any{
					"error": err.Error(),
				})
				continue
			}
			if status.HandshakeObserved {
				select {
				case out <- status:
				default:
				}
				return
			}
		}
	}
}

func (r *Runner) awaitHandshakeAfterTraffic(ctx context.Context, handshakeCh <-chan backend.Status, adapter backend.Adapter) (backend.Status, diag.Code) {
	status, err := adapter.Status(ctx)
	if err == nil && status.HandshakeObserved {
		return status, ""
	}

	timer := time.NewTimer(r.options.HandshakeTimeout)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			r.reporter.Error(diag.CodeHandshakeTimeout, "connectivity.handshake_timeout", "timed out while waiting for peer handshake after traffic attempt", map[string]any{
				"error": ctx.Err().Error(),
			})
			return backend.Status{}, diag.CodeHandshakeTimeout
		case <-timer.C:
			r.reporter.Error(diag.CodeHandshakeTimeout, "connectivity.handshake_timeout", "timed out while waiting for peer handshake after traffic attempt", map[string]any{
				"timeoutMs": r.options.HandshakeTimeout.Milliseconds(),
			})
			return backend.Status{}, diag.CodeHandshakeTimeout
		case status := <-handshakeCh:
			return status, ""
		}
	}
}

func (r *Runner) reportConnectivityFailure(err error, target connectivity.RequestTarget) diag.Code {
	code := diag.CodeInternalError
	event := "connectivity.failed"
	fields := map[string]any{}
	if target.Address != "" {
		fields["target"] = target.Address
	}
	if err != nil {
		fields["error"] = err.Error()
	}
	if connectivityErr, ok := err.(connectivity.Error); ok {
		code = connectivityErr.Code
		fields["stage"] = connectivityErr.Stage
	} else if err != nil {
		code = diag.CodeInternalError
	}
	if code == diag.CodeRequestTimeout {
		event = "connectivity.request_failed"
	} else if code == diag.CodeSocksConnectFailed || code == diag.CodeSocksHandshakeFailed || code == diag.CodeRemoteTCPConnectFailed {
		event = "connectivity.tcp_connect_failed"
	}
	r.reporter.Error(code, event, "connectivity proof failed", fields)
	return code
}
