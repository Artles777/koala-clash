package config

type Config struct {
	Version     int               `json:"version"`
	Profile     Profile           `json:"profile"`
	LocalProxy  LocalProxy         `json:"localProxy"`
	Diagnostics DiagnosticsOptions `json:"diagnostics,omitempty"`
}

type Profile struct {
	Type       string          `json:"type"`
	SourceKind string          `json:"sourceKind"`
	Name       string          `json:"name,omitempty"`
	Keys       KeyMaterial     `json:"keys"`
	Endpoint   Endpoint        `json:"endpoint"`
	Interface  InterfaceConfig `json:"interface"`
	Peer       PeerConfig      `json:"peer"`
	Amnezia    AmneziaFields   `json:"amnezia,omitempty"`
	Metadata   map[string]any  `json:"metadata,omitempty"`
}

type KeyMaterial struct {
	PrivateKey      string `json:"privateKey"`
	ServerPublicKey string `json:"serverPublicKey"`
	PresharedKey    string `json:"presharedKey,omitempty"`
}

type Endpoint struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

type InterfaceConfig struct {
	Addresses []string `json:"addresses"`
	MTU       int      `json:"mtu,omitempty"`
	DNS       []string `json:"dns,omitempty"`
}

type PeerConfig struct {
	AllowedIPs          []string `json:"allowedIPs"`
	PersistentKeepalive int      `json:"persistentKeepalive,omitempty"`
}

type AmneziaFields struct {
	Jc   string `json:"Jc,omitempty"`
	Jmin string `json:"Jmin,omitempty"`
	Jmax string `json:"Jmax,omitempty"`
	S1   string `json:"S1,omitempty"`
	S2   string `json:"S2,omitempty"`
	S3   string `json:"S3,omitempty"`
	S4   string `json:"S4,omitempty"`
	H1   string `json:"H1,omitempty"`
	H2   string `json:"H2,omitempty"`
	H3   string `json:"H3,omitempty"`
	H4   string `json:"H4,omitempty"`
	I1   string `json:"I1,omitempty"`
	I2   string `json:"I2,omitempty"`
	I3   string `json:"I3,omitempty"`
	I4   string `json:"I4,omitempty"`
	I5   string `json:"I5,omitempty"`
}

type LocalProxy struct {
	ListenHost string   `json:"listenHost"`
	ListenPort int      `json:"listenPort"`
	Protocols  []string `json:"protocols"`
	UDP        bool     `json:"udp"`
}

type DiagnosticsOptions struct {
	LogLevel string `json:"logLevel,omitempty"`
}
