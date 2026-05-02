package backend

import (
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
	"net/netip"
	"regexp"
	"strconv"
	"strings"

	"github.com/koala-clash/amnezia-helper/internal/config"
	"github.com/koala-clash/amnezia-helper/internal/diag"
)

var hexKeyPattern = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

func BuildRuntimeConfig(cfg config.Config) (RuntimeConfig, error) {
	privateKey, err := keyToHex("profile.keys.privateKey", cfg.Profile.Keys.PrivateKey)
	if err != nil {
		return RuntimeConfig{}, err
	}
	publicKey, err := keyToHex("profile.keys.serverPublicKey", cfg.Profile.Keys.ServerPublicKey)
	if err != nil {
		return RuntimeConfig{}, err
	}
	presharedKey := ""
	if strings.TrimSpace(cfg.Profile.Keys.PresharedKey) != "" {
		presharedKey, err = keyToHex("profile.keys.presharedKey", cfg.Profile.Keys.PresharedKey)
		if err != nil {
			return RuntimeConfig{}, err
		}
	}

	localAddresses, err := parseLocalAddresses(cfg.Profile.Interface.Addresses)
	if err != nil {
		return RuntimeConfig{}, err
	}
	dnsServers, err := parseDNSServers(cfg.Profile.Interface.DNS)
	if err != nil {
		return RuntimeConfig{}, err
	}

	mtu := cfg.Profile.Interface.MTU
	if mtu == 0 {
		mtu = DefaultMTU
	}
	if mtu < 576 || mtu > 9000 {
		return RuntimeConfig{}, MappingError{Code: diag.CodeInvalidConfig, Field: "profile.interface.mtu", Message: "MTU must be in range 576..9000"}
	}

	allowedIPs, err := normalizeAllowedIPs(cfg.Profile.Peer.AllowedIPs)
	if err != nil {
		return RuntimeConfig{}, err
	}

	var uapi strings.Builder
	appendLine(&uapi, "private_key", privateKey)
	if err := appendAmneziaFields(&uapi, cfg.Profile.Type, cfg.Profile.Amnezia); err != nil {
		return RuntimeConfig{}, err
	}
	appendLine(&uapi, "replace_peers", "true")
	appendLine(&uapi, "public_key", publicKey)
	if presharedKey != "" {
		appendLine(&uapi, "preshared_key", presharedKey)
	}
	endpoint := net.JoinHostPort(cfg.Profile.Endpoint.Host, strconv.Itoa(cfg.Profile.Endpoint.Port))
	appendLine(&uapi, "endpoint", endpoint)
	appendLine(&uapi, "persistent_keepalive_interval", strconv.Itoa(cfg.Profile.Peer.PersistentKeepalive))
	appendLine(&uapi, "replace_allowed_ips", "true")
	for _, allowedIP := range allowedIPs {
		appendLine(&uapi, "allowed_ip", allowedIP)
	}

	return RuntimeConfig{
		UAPI:                  uapi.String(),
		LocalAddresses:        localAddresses,
		DNSServers:            dnsServers,
		MTU:                   mtu,
		Endpoint:              endpoint,
		EndpointHost:          cfg.Profile.Endpoint.Host,
		EndpointPort:          cfg.Profile.Endpoint.Port,
		AllowedIPs:            allowedIPs,
		AcceptedIgnoredFields: nil,
	}, nil
}

func keyToHex(field string, value string) (string, error) {
	value = strings.TrimSpace(value)
	if hexKeyPattern.MatchString(value) {
		return strings.ToLower(value), nil
	}

	encodings := []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	}
	for _, encoding := range encodings {
		decoded, err := encoding.DecodeString(value)
		if err == nil && len(decoded) == 32 {
			return hex.EncodeToString(decoded), nil
		}
	}
	return "", MappingError{Code: diag.CodeInvalidConfig, Field: field, Message: "WireGuard key must be 32 bytes encoded as base64 or hex"}
}

func parseLocalAddresses(values []string) ([]netip.Addr, error) {
	addresses := make([]netip.Addr, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if strings.Contains(value, "/") {
			prefix, err := netip.ParsePrefix(value)
			if err != nil {
				return nil, MappingError{Code: diag.CodeInvalidConfig, Field: "profile.interface.addresses", Message: fmt.Sprintf("invalid address %q", value)}
			}
			addresses = append(addresses, prefix.Addr())
			continue
		}
		addr, err := netip.ParseAddr(value)
		if err != nil {
			return nil, MappingError{Code: diag.CodeInvalidConfig, Field: "profile.interface.addresses", Message: fmt.Sprintf("invalid address %q", value)}
		}
		addresses = append(addresses, addr)
	}
	return addresses, nil
}

func parseDNSServers(values []string) ([]netip.Addr, error) {
	servers := make([]netip.Addr, 0, len(values))
	for _, value := range values {
		addr, err := netip.ParseAddr(strings.TrimSpace(value))
		if err != nil {
			return nil, MappingError{Code: diag.CodeInvalidConfig, Field: "profile.interface.dns", Message: fmt.Sprintf("invalid DNS address %q", value)}
		}
		servers = append(servers, addr)
	}
	return servers, nil
}

func normalizeAllowedIPs(values []string) ([]string, error) {
	allowed := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if strings.Contains(value, "/") {
			prefix, err := netip.ParsePrefix(value)
			if err != nil {
				return nil, MappingError{Code: diag.CodeInvalidConfig, Field: "profile.peer.allowedIPs", Message: fmt.Sprintf("invalid allowed IP %q", value)}
			}
			allowed = append(allowed, prefix.String())
			continue
		}
		addr, err := netip.ParseAddr(value)
		if err != nil {
			return nil, MappingError{Code: diag.CodeInvalidConfig, Field: "profile.peer.allowedIPs", Message: fmt.Sprintf("invalid allowed IP %q", value)}
		}
		bits := 32
		if addr.Is6() {
			bits = 128
		}
		allowed = append(allowed, netip.PrefixFrom(addr, bits).String())
	}
	return allowed, nil
}

func appendAmneziaFields(builder *strings.Builder, profileType string, fields config.AmneziaFields) error {
	entries := []struct {
		configName string
		uapiName   string
		value      string
	}{
		{"Jc", "jc", fields.Jc},
		{"Jmin", "jmin", fields.Jmin},
		{"Jmax", "jmax", fields.Jmax},
		{"S1", "s1", fields.S1},
		{"S2", "s2", fields.S2},
		{"S3", "s3", fields.S3},
		{"S4", "s4", fields.S4},
		{"H1", "h1", fields.H1},
		{"H2", "h2", fields.H2},
		{"H3", "h3", fields.H3},
		{"H4", "h4", fields.H4},
		{"I1", "i1", fields.I1},
		{"I2", "i2", fields.I2},
		{"I3", "i3", fields.I3},
		{"I4", "i4", fields.I4},
		{"I5", "i5", fields.I5},
	}
	for _, entry := range entries {
		if strings.TrimSpace(entry.value) == "" {
			continue
		}
		if profileType != config.ProfileTypeAmneziaWG {
			return MappingError{Code: diag.CodeUnsupportedField, Field: "profile.amnezia." + entry.configName, Message: "Amnezia obfuscation fields require profile.type=amneziawg"}
		}
		appendLine(builder, entry.uapiName, strings.TrimSpace(entry.value))
	}
	return nil
}

func appendLine(builder *strings.Builder, key string, value string) {
	builder.WriteString(key)
	builder.WriteByte('=')
	builder.WriteString(value)
	builder.WriteByte('\n')
}
