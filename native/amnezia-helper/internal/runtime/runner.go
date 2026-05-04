package runtime

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/koala-clash/amnezia-helper/internal/backend"
	"github.com/koala-clash/amnezia-helper/internal/config"
	"github.com/koala-clash/amnezia-helper/internal/diag"
	"github.com/koala-clash/amnezia-helper/internal/proxy"
)

type Options struct {
	StubBackend bool
}

type Runner struct {
	cfg      config.Config
	reporter *diag.Reporter
	options  Options
}

func NewRunner(cfg config.Config, reporter *diag.Reporter, options Options) *Runner {
	return &Runner{cfg: cfg, reporter: reporter, options: options}
}

func (r *Runner) Run(ctx context.Context) diag.Code {
	runCtx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	var adapter backend.Adapter
	var dialer proxy.DialContextFunc

	if r.options.StubBackend {
		r.reporter.Emit(diag.LevelWarn, "backend.stub_enabled", "running without real tunnel backend", nil)
	} else {
		realBackend, runtimeConfig, err := backend.NewAmneziaWG(r.cfg)
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
		adapter = realBackend
		dialer = adapter.DialContext

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
			"endpoint": runtimeConfig.Endpoint,
		})
	}

	listener, endpoint, err := proxy.StartSOCKS5(runCtx, r.cfg.LocalProxy.ListenHost, r.cfg.LocalProxy.ListenPort, dialer)
	if err != nil {
		r.reporter.Error(diag.CodeSocksBindFailed, "helper.error", "failed to bind local SOCKS5 listener", map[string]any{
			"error": err.Error(),
			"host":  r.cfg.LocalProxy.ListenHost,
			"port":  r.cfg.LocalProxy.ListenPort,
		})
		return diag.CodeSocksBindFailed
	}

	r.reporter.Emit(diag.LevelInfo, "proxy.listening", "local SOCKS5 listener is bound", map[string]any{
		"host": endpoint.Host,
		"port": endpoint.Port,
	})
	if r.options.StubBackend {
		r.reporter.Emit(diag.LevelWarn, "helper.ready_stub", "stub mode is process-ready but tunnel traffic is not supported", map[string]any{
			"localProxy": endpoint,
		})
	} else {
		r.reporter.Emit(diag.LevelWarn, "readiness.handshake_pending", "backend and SOCKS are started, but peer handshake has not been observed yet", map[string]any{
			"localProxy": endpoint,
		})
		go r.monitorHandshake(runCtx, adapter)
	}

	<-runCtx.Done()

	r.reporter.Emit(diag.LevelInfo, "helper.stopping", "shutdown requested", nil)
	if err := listener.Close(); err != nil {
		fmt.Fprintf(os.Stderr, "listener close failed: %v\n", err)
	}
	r.reporter.Emit(diag.LevelInfo, "helper.stopped", "shutdown complete", nil)
	return ""
}

func (r *Runner) monitorHandshake(ctx context.Context, adapter backend.Adapter) {
	if adapter == nil {
		return
	}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
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
				r.reporter.Emit(diag.LevelInfo, "handshake.observed", "peer handshake observed", map[string]any{
					"lastHandshakeAt": status.LastHandshakeAt,
					"txBytes":         status.TxBytes,
					"rxBytes":         status.RxBytes,
				})
				r.reporter.Emit(diag.LevelInfo, "helper.ready", "backend, SOCKS listener, and peer handshake are ready", nil)
				return
			}
		}
	}
}
