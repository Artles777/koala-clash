import Foundation

public let koalaMacProcessBypassProvider = "NETransparentProxyProvider"
public let koalaMacProcessBypassProviderBundleIdentifier =
  "com.koalaclash.processbypass.transparent-proxy"

public enum KoalaMacProcessBypassCommand: String {
  case status
  case apply
  case cleanup
}

public enum KoalaMacProcessBypassReasonCode: String, Codable {
  case macosEntitlementsMissing = "macos_entitlements_missing"
  case macosExtensionNotInstalled = "macos_extension_not_installed"
  case macosUserApprovalRequired = "macos_user_approval_required"
  case macosDataPlanePending = "macos_data_plane_pending"
  case macosDataPlaneActive = "macos_data_plane_active"
  case macosApplyFailed = "macos_apply_failed"
  case macosCleanupFailed = "macos_cleanup_failed"
  case macosCleanupComplete = "macos_cleanup_complete"
  case noProcessNames = "no_process_names"
  case invalidArguments = "invalid_arguments"
}

public struct KoalaMacProcessBypassStatus: Codable {
  public var ok: Bool
  public var available: Bool
  public var entitlementsPresent: Bool
  public var extensionInstalled: Bool
  public var userApprovalRequired: Bool
  public var dataPlaneActive: Bool
  public var fallbackOnly: Bool
  public var activeSessionId: String?
  public var reasonCode: KoalaMacProcessBypassReasonCode
  public var message: String
  public var diagnostics: [String]
  public var appliedProcessNames: [String]
  public var provider: String
  public var providerBundleIdentifier: String

  public init(
    ok: Bool,
    available: Bool,
    entitlementsPresent: Bool,
    extensionInstalled: Bool,
    userApprovalRequired: Bool,
    dataPlaneActive: Bool,
    fallbackOnly: Bool,
    activeSessionId: String? = nil,
    reasonCode: KoalaMacProcessBypassReasonCode,
    message: String,
    diagnostics: [String],
    appliedProcessNames: [String] = []
  ) {
    self.ok = ok
    self.available = available
    self.entitlementsPresent = entitlementsPresent
    self.extensionInstalled = extensionInstalled
    self.userApprovalRequired = userApprovalRequired
    self.dataPlaneActive = dataPlaneActive
    self.fallbackOnly = fallbackOnly
    self.activeSessionId = activeSessionId
    self.reasonCode = reasonCode
    self.message = message
    self.diagnostics = diagnostics
    self.appliedProcessNames = appliedProcessNames
    self.provider = koalaMacProcessBypassProvider
    self.providerBundleIdentifier = koalaMacProcessBypassProviderBundleIdentifier
  }
}

public func makePendingMacProcessBypassStatus(
  command: KoalaMacProcessBypassCommand,
  sessionId: String?,
  processNames: [String]
) -> KoalaMacProcessBypassStatus {
  switch command {
  case .status:
    return KoalaMacProcessBypassStatus(
      ok: true,
      available: false,
      entitlementsPresent: false,
      extensionInstalled: false,
      userApprovalRequired: true,
      dataPlaneActive: false,
      fallbackOnly: true,
      activeSessionId: sessionId,
      reasonCode: .macosDataPlanePending,
      message: "macOS native process bypass scaffold is present, but no signed Network/System Extension data plane is active.",
      diagnostics: [
        "Koala must keep macOS PROCESS-NAME,DIRECT in fallback-only mode until the extension is signed, installed, approved, and enabled.",
        "Current fallback remains address-based DIRECT exclude plus learned process-to-IP bypass."
      ]
    )
  case .apply:
    let reason: KoalaMacProcessBypassReasonCode =
      processNames.isEmpty ? .noProcessNames : .macosDataPlanePending
    return KoalaMacProcessBypassStatus(
      ok: false,
      available: false,
      entitlementsPresent: false,
      extensionInstalled: false,
      userApprovalRequired: true,
      dataPlaneActive: false,
      fallbackOnly: true,
      activeSessionId: sessionId,
      reasonCode: reason,
      message: "Cannot apply true macOS process bypass until the Network/System Extension data plane exists.",
      diagnostics: [
        "No true_bypass must be reported from this scaffold.",
        "Future implementation must confirm provider activation and per-process flow policy before returning dataPlaneActive=true."
      ],
      appliedProcessNames: []
    )
  case .cleanup:
    return KoalaMacProcessBypassStatus(
      ok: true,
      available: false,
      entitlementsPresent: false,
      extensionInstalled: false,
      userApprovalRequired: true,
      dataPlaneActive: false,
      fallbackOnly: true,
      activeSessionId: nil,
      reasonCode: .macosCleanupComplete,
      message: "No macOS native process bypass data plane was active; cleanup is a no-op.",
      diagnostics: ["Cleanup completed for the scaffold state."]
    )
  }
}

public func encodeStatusJson(_ status: KoalaMacProcessBypassStatus) throws -> String {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys]
  let data = try encoder.encode(status)
  return String(decoding: data, as: UTF8.self)
}
