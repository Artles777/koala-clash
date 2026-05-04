package config

import (
	"fmt"
	"net"
	"strings"

	"github.com/koala-clash/amnezia-helper/internal/diag"
)

const (
	ProfileTypeAmneziaWG = "amneziawg"
	ProfileTypeWireGuard = "wireguard"

	SourceKindSelfContained    = "self_contained"
	SourceKindGatewayExpansion = "gateway_expansion"
	SourceKindAPIOnly          = "api_only"
)

type ValidationError struct {
	Code    diag.Code
	Field   string
	Message string
}

func (e ValidationError) Error() string {
	if e.Field == "" {
		return e.Message
	}
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

func Validate(cfg Config) error {
	if cfg.Version != 1 {
		return ValidationError{Code: diag.CodeInvalidConfig, Field: "version", Message: "only config version 1 is supported"}
	}

	switch cfg.Profile.SourceKind {
	case SourceKindSelfContained:
	case SourceKindGatewayExpansion, SourceKindAPIOnly:
		return ValidationError{
			Code:    diag.CodeProfileRequiresGatewayExpansion,
			Field:   "profile.sourceKind",
			Message: "profile must be expanded by Koala or Amnezia gateway before helper startup",
		}
	case "":
		return missing("profile.sourceKind")
	default:
		return ValidationError{Code: diag.CodeUnsupportedProfileType, Field: "profile.sourceKind", Message: "unsupported source kind"}
	}

	switch cfg.Profile.Type {
	case ProfileTypeAmneziaWG, ProfileTypeWireGuard:
	case "":
		return missing("profile.type")
	default:
		return ValidationError{Code: diag.CodeUnsupportedProfileType, Field: "profile.type", Message: "only amneziawg and wireguard are supported in v1"}
	}

	if strings.TrimSpace(cfg.Profile.Keys.PrivateKey) == "" {
		return missing("profile.keys.privateKey")
	}
	if strings.TrimSpace(cfg.Profile.Keys.ServerPublicKey) == "" {
		return missing("profile.keys.serverPublicKey")
	}
	if strings.TrimSpace(cfg.Profile.Endpoint.Host) == "" {
		return missing("profile.endpoint.host")
	}
	if cfg.Profile.Endpoint.Port <= 0 || cfg.Profile.Endpoint.Port > 65535 {
		return ValidationError{Code: diag.CodeInvalidConfig, Field: "profile.endpoint.port", Message: "port must be in range 1..65535"}
	}
	if len(cfg.Profile.Interface.Addresses) == 0 {
		return missing("profile.interface.addresses")
	}
	if cfg.Profile.Interface.MTU != 0 && (cfg.Profile.Interface.MTU < 576 || cfg.Profile.Interface.MTU > 9000) {
		return ValidationError{Code: diag.CodeInvalidConfig, Field: "profile.interface.mtu", Message: "MTU must be in range 576..9000"}
	}
	for _, address := range cfg.Profile.Interface.Addresses {
		if err := validateCIDROrIP(address); err != nil {
			return ValidationError{Code: diag.CodeInvalidConfig, Field: "profile.interface.addresses", Message: err.Error()}
		}
	}
	for _, dns := range cfg.Profile.Interface.DNS {
		if net.ParseIP(strings.TrimSpace(dns)) == nil {
			return ValidationError{Code: diag.CodeInvalidConfig, Field: "profile.interface.dns", Message: fmt.Sprintf("invalid DNS IP address %q", dns)}
		}
	}
	if len(cfg.Profile.Peer.AllowedIPs) == 0 {
		return missing("profile.peer.allowedIPs")
	}
	if cfg.Profile.Peer.PersistentKeepalive < 0 || cfg.Profile.Peer.PersistentKeepalive > 65535 {
		return ValidationError{Code: diag.CodeInvalidConfig, Field: "profile.peer.persistentKeepalive", Message: "persistent keepalive must be in range 0..65535"}
	}
	for _, allowedIP := range cfg.Profile.Peer.AllowedIPs {
		if err := validateCIDROrIP(allowedIP); err != nil {
			return ValidationError{Code: diag.CodeInvalidConfig, Field: "profile.peer.allowedIPs", Message: err.Error()}
		}
	}
	if strings.TrimSpace(cfg.LocalProxy.ListenHost) == "" {
		return missing("localProxy.listenHost")
	}
	if cfg.LocalProxy.ListenPort < 0 || cfg.LocalProxy.ListenPort > 65535 {
		return ValidationError{Code: diag.CodeInvalidConfig, Field: "localProxy.listenPort", Message: "port must be in range 0..65535"}
	}
	if !supportsProtocol(cfg.LocalProxy.Protocols, "socks5") {
		return ValidationError{Code: diag.CodeUnsupportedProfileType, Field: "localProxy.protocols", Message: "v1 requires socks5 local proxy support"}
	}
	return nil
}

func missing(field string) ValidationError {
	return ValidationError{Code: diag.CodeMissingRequiredField, Field: field, Message: "required field is missing"}
}

func validateCIDROrIP(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return fmt.Errorf("empty address")
	}
	if strings.Contains(value, "/") {
		if _, _, err := net.ParseCIDR(value); err != nil {
			return fmt.Errorf("invalid CIDR %q", value)
		}
		return nil
	}
	if net.ParseIP(value) == nil {
		return fmt.Errorf("invalid IP address %q", value)
	}
	return nil
}

func supportsProtocol(protocols []string, protocol string) bool {
	for _, item := range protocols {
		if strings.EqualFold(strings.TrimSpace(item), protocol) {
			return true
		}
	}
	return false
}
