import Foundation
import NetworkExtension
import KoalaMacProcessBypassShared

public final class KoalaTransparentProxyProvider: NETransparentProxyProvider {
  public override func startProxy(
    options: [String: Any]? = nil,
    completionHandler: @escaping (Error?) -> Void
  ) {
    // Scaffold only. A future signed System Extension must install transparent proxy
    // rules and confirm a process-aware data plane before Koala may report true_bypass.
    completionHandler(nil)
  }

  public override func stopProxy(
    with reason: NEProviderStopReason,
    completionHandler: @escaping () -> Void
  ) {
    // Future implementation should remove any provider-owned flow policy here.
    completionHandler()
  }

  public override func handleNewFlow(_ flow: NEAppProxyFlow) -> Bool {
    // Returning false lets the system handle the flow normally. This keeps the
    // scaffold safe and prevents accidental interception before a real policy
    // engine exists.
    return false
  }
}
