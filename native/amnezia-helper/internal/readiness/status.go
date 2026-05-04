package readiness

type Status string

const (
	StatusStarting          Status = "starting"
	StatusConfigValidated   Status = "config_validated"
	StatusProxyListening    Status = "proxy_listening"
	StatusBackendStarting   Status = "backend_starting"
	StatusBackendStarted    Status = "backend_started"
	StatusBackendReady      Status = "backend_ready"
	StatusHandshakeObserved Status = "handshake_observed"
	StatusHandshakePending  Status = "handshake_pending"
	StatusReady             Status = "ready"
	StatusStopping          Status = "stopping"
	StatusStopped           Status = "stopped"
	StatusFailed            Status = "failed"
)

type Snapshot struct {
	Status       Status `json:"status"`
	ListenHost   string `json:"listenHost,omitempty"`
	ListenPort   int    `json:"listenPort,omitempty"`
	BackendReady bool   `json:"backendReady"`
	ProxyReady   bool   `json:"proxyReady"`
	LastError    string `json:"lastError,omitempty"`
}
