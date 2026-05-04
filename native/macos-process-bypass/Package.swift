// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "KoalaMacProcessBypass",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "koala-macos-process-bypassctl", targets: ["KoalaMacProcessBypassController"]),
    .library(name: "KoalaMacProcessBypassShared", targets: ["KoalaMacProcessBypassShared"]),
    .library(name: "KoalaMacProcessBypassProvider", targets: ["KoalaMacProcessBypassProvider"])
  ],
  targets: [
    .target(name: "KoalaMacProcessBypassShared"),
    .executableTarget(
      name: "KoalaMacProcessBypassController",
      dependencies: ["KoalaMacProcessBypassShared"]
    ),
    .target(
      name: "KoalaMacProcessBypassProvider",
      dependencies: ["KoalaMacProcessBypassShared"]
    )
  ]
)
