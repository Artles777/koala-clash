import Foundation
import KoalaMacProcessBypassShared

struct ParsedArguments {
  var command: KoalaMacProcessBypassCommand
  var json: Bool
  var sessionId: String?
  var processNames: [String]
}

func parseArguments(_ args: [String]) throws -> ParsedArguments {
  guard let commandValue = args.first, let command = KoalaMacProcessBypassCommand(rawValue: commandValue) else {
    throw ArgumentError("expected command: status, apply, or cleanup")
  }

  var json = false
  var sessionId: String?
  var processNames: [String] = []
  var index = 1

  while index < args.count {
    let arg = args[index]
    switch arg {
    case "--json":
      json = true
      index += 1
    case "--session":
      guard index + 1 < args.count else { throw ArgumentError("--session requires a value") }
      sessionId = args[index + 1]
      index += 2
    case "--process-name":
      guard index + 1 < args.count else { throw ArgumentError("--process-name requires a value") }
      processNames.append(args[index + 1])
      index += 2
    default:
      throw ArgumentError("unknown argument: \(arg)")
    }
  }

  return ParsedArguments(command: command, json: json, sessionId: sessionId, processNames: processNames)
}

struct ArgumentError: Error, CustomStringConvertible {
  let description: String

  init(_ description: String) {
    self.description = description
  }
}

func emit(_ status: KoalaMacProcessBypassStatus, json: Bool) {
  if json {
    if let payload = try? encodeStatusJson(status) {
      print(payload)
    } else {
      print("{\"ok\":false,\"dataPlaneActive\":false,\"fallbackOnly\":true,\"reasonCode\":\"macos_apply_failed\",\"message\":\"failed to encode status\"}")
    }
    return
  }

  print(status.message)
  for diagnostic in status.diagnostics {
    print("- \(diagnostic)")
  }
}

do {
  let parsed = try parseArguments(Array(CommandLine.arguments.dropFirst()))
  let status = makePendingMacProcessBypassStatus(
    command: parsed.command,
    sessionId: parsed.sessionId,
    processNames: parsed.processNames
  )
  emit(status, json: parsed.json)
  exit(status.ok ? 0 : 2)
} catch {
  let status = KoalaMacProcessBypassStatus(
    ok: false,
    available: false,
    entitlementsPresent: false,
    extensionInstalled: false,
    userApprovalRequired: true,
    dataPlaneActive: false,
    fallbackOnly: true,
    reasonCode: .invalidArguments,
    message: String(describing: error),
    diagnostics: ["Usage: koala-macos-process-bypassctl status|apply|cleanup --json [--session <id>] [--process-name <name>]"]
  )
  emit(status, json: CommandLine.arguments.contains("--json"))
  exit(64)
}
